#!/usr/bin/env python3
"""Write demo rows onto the quiz leaderboards, so a new board is not empty.

    python backend/tools/seed_leaderboard.py --dry-run
    python backend/tools/seed_leaderboard.py --profile default
    python backend/tools/seed_leaderboard.py --purge

Every row this writes carries a ``sub`` starting with DEMO_SUB_PREFIX, and that
is the only thing marking it: /v1/quiz/leaderboard returns name, score, total,
elapsedMs and at, never the sub, so the rows are indistinguishable from real
ones on the site and trivially findable in the table. ``--purge`` deletes them
and nothing else.

Re-running is idempotent. The seeder purges its own rows before writing, so a
changed score cannot leave the old row behind under its old rank key, and the
RNG is seeded with a constant, so the boards do not reshuffle between runs.

The numbers are shaped rather than uniform, because a real board is: this week's
board holds a subset of the all-time one, and a player's weekly row is never
better than their all-time row (the same submission writes both).

They are also all beatable, which matters more than looking impressive. A board
topped by a perfect score at four seconds a question tells an arriving learner
the game is not for them; the top row here is a good-but-ordinary run that a
careful player passes on their second or third attempt.

Deliberately NOT written: the ``USER#{sub}/BEST#{mode}#{period}`` pointers a
real submission advances. Those exist so a returning player's next run can
retire their own row, and no demo player ever returns. The one-row-per-player
invariant that ``quiz_db.record_best`` protects with a transaction holds here by
construction, since this file computes exactly one row per player per board.
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app import quiz  # noqa: E402  (needs the path juggling above)

DEFAULT_TABLE = "vc-quiz"
DEFAULT_REGION = "eu-central-1"

#: The marker. Never let a demo row exist without it.
DEMO_SUB_PREFIX = "demo-"

#: Fixed, so two runs produce the same boards. Change it to deal new numbers.
SEED = 20260817

#: How far back --purge looks for weekly partitions this tool has written into.
#: Weekly rows carry a TTL and would age out anyway; this just makes a cleanup
#: immediate rather than eventual.
PURGE_WEEKS = 8

#: Fallback when src/quiz/bank is not on disk (it is gitignored). A sprint deals
#: min(SPRINT_POOL, bank size), and the bank is nowhere near the pool yet.
FALLBACK_BANK_SIZE = 134

#: A board is a top ten. Writing more rows than that just pushes real players
#: off the page they came to get onto.
BOARD_SIZE = 10

#: Handles only. displayName is what goes on a certificate; a board shows the
#: nickname, and these are nicknames. More names than fit one board, so the two
#: modes can show different faces.
PLAYERS = (
    "strawhat92",
    "kostas87",
    "mikefk",
    "nikos1234",
    "stavrosk",
    "gorge_",
    "tommybot22",
    "jimmyb",
    "panosx",
    "dimitris7",
    "alexgr",
    "mario98",
    "johnnyb",
    "nickp_",
    "thes92",
)

#: (score, elapsed ms) best first, ten rows, sorted the way the board sorts:
#: score descending, then time ascending. The top row is 16/20 in 7:01, a pace
#: of twenty-one seconds a question, so beating it needs care rather than a
#: stopwatch. Everything below leaves room to land in the middle first.
SET20_RESULTS = (
    (16, 421_000),  # 7:01
    (15, 384_000),  # 6:24
    (15, 467_000),  # 7:47
    (14, 365_000),  # 6:05
    (14, 439_000),  # 7:19
    (13, 408_000),  # 6:48
    (13, 491_000),  # 8:11
    (12, 422_000),  # 7:02
    (11, 399_000),  # 6:39
    (10, 504_000),  # 8:24
)

#: Best first. Three minutes against a pool nobody exhausts, so these are counts
#: of correct answers and the board hides the (identical) times. Fifteen in
#: three minutes is the same unhurried pace as the Set of 20 board above.
SPRINT_SCORES = (15, 14, 12, 11, 10, 9, 8, 7, 6, 4)

#: How far back an all-time best may have been set.
HISTORY_DAYS = 60


def bank_size() -> int:
    """How many questions a sprint would deal today, read from the bank on disk."""
    try:
        from seed_quiz import load_bank  # sibling tool, same directory

        return min(quiz.SPRINT_POOL, len(load_bank()))
    except Exception:  # bank dir absent, or a topic file missing
        return min(quiz.SPRINT_POOL, FALLBACK_BANK_SIZE)


def week_start(now: datetime) -> datetime:
    """Midnight UTC on the Monday of the ISO week ``now`` falls in."""
    monday = now - timedelta(days=now.isocalendar()[2] - 1)
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


#: Hours (UTC) a run is likely to have happened in. Athens is UTC+2/+3, so this
#: is roughly nine in the morning to midnight, which is when people sit down to
#: a Git course. Nothing reads `at` on the site, but a table full of 04:00 runs
#: is a tell to anyone who does look.
WAKING_HOURS = range(6, 22)


def _moment(rng: random.Random, start: datetime, end: datetime) -> datetime:
    """A time in the window, preferring waking hours but never leaving it.

    Rejection sampling rather than snapping the hour, because the window can be
    a few hours wide (the current week, early on a Monday) and a snapped hour
    would fall outside it.
    """
    span = max(1, int((end - start).total_seconds()))
    moment = start
    for _ in range(20):
        moment = start + timedelta(seconds=rng.randrange(span))
        if moment.hour in WAKING_HOURS:
            break
    return moment


#: Ceiling on a weekly off-run, short of the mode's own 10:00 deadline: a row
#: sitting exactly on the deadline reads as a timeout, not as a run.
WEEKLY_SLOWER_CAP = 570_000


def _sprint_elapsed(rng: random.Random) -> int:
    """Every sprint runs the full three minutes, plus the submit round trip."""
    return quiz.SPRINT_DURATION_MS + rng.randrange(140, 2_900)


class Row(dict):
    """One leaderboard row, keyed the way the table stores it."""


def _row(*, name: str, score: int, total: int, elapsed_ms: int, at: datetime) -> Row:
    return Row(
        sub=f"{DEMO_SUB_PREFIX}{name}",
        name=name,
        score=score,
        total=total,
        elapsedMs=elapsed_ms,
        at=quiz.iso_seconds(at),
        rankKey=quiz.rank_key(score, elapsed_ms),
        _at=at,
    )


def _weekly_players(
    board_names: list[str], rng: random.Random, count: int
) -> set[str]:
    """Which of one board's players also posted a run in the current week.

    Drawn per board rather than once for everyone, so a quiet week cannot empty
    one of the two weekly boards while filling the other.
    """
    return set(rng.sample(board_names, min(count, len(board_names))))


def build_boards(now: datetime, rng: random.Random) -> dict[tuple[str, str], list[Row]]:
    """Every board this tool fills: (mode, period) -> rows, best first.

    A player is one identity across all four boards: same handle, same sub, and
    a weekly row only where the all-time row it derives from allows one.
    """
    start = week_start(now)
    # A board that is one day into the week should not show a full week of
    # activity, so the size of the weekly boards follows how much of the week
    # has actually happened.
    fraction = (now - start) / timedelta(days=7)
    weekly_count = max(2, min(BOARD_SIZE, round(2 + 7 * fraction)))

    names = list(PLAYERS)
    rng.shuffle(names)
    set20_names = names[:BOARD_SIZE]
    # The handles the Set of 20 board has no room for get the sprint board
    # instead, so every one of them is somewhere.
    bench = names[BOARD_SIZE:]

    sprint_total = bank_size()
    history_start = now - timedelta(days=HISTORY_DAYS)
    boards: dict[tuple[str, str], list[Row]] = {
        ("set20", "ALL"): [],
        ("set20", "WEEK"): [],
        ("sprint", "ALL"): [],
        ("sprint", "WEEK"): [],
    }

    # The sprint field is the bench plus enough of the Set of 20 field to fill a
    # board, ordered roughly the way those players stand there: the two modes
    # ask the same questions, so the person who scores best on one is not the
    # worst on the other. The jitter stops the boards being the same list twice.
    sprint_names = sorted(
        bench + rng.sample(set20_names, BOARD_SIZE - len(bench)),
        key=lambda name: names.index(name) + rng.randrange(-4, 5),
    )

    set20_active = _weekly_players(set20_names, rng, weekly_count)
    sprint_active = _weekly_players(sprint_names, rng, weekly_count)

    for index, name in enumerate(set20_names):
        score, elapsed = SET20_RESULTS[index]
        # A real elapsed does not land on a whole second. Under half of one, so
        # the row still reads as the time the ladder above documents.
        elapsed += rng.randrange(0, 500)
        # 40% of the players active this week set their all-time best in it; the
        # rest are climbing back towards an older personal best.
        fresh = name in set20_active and rng.random() < 0.4
        at = _moment(rng, start, now) if fresh else _moment(rng, history_start, start)
        best = _row(name=name, score=score, total=20, elapsed_ms=elapsed, at=at)
        boards[("set20", "ALL")].append(best)

        if name not in set20_active:
            continue
        if fresh:
            boards[("set20", "WEEK")].append(best)
            continue
        boards[("set20", "WEEK")].append(
            _row(
                name=name,
                score=max(0, score - rng.randrange(1, 5)),
                total=20,
                elapsed_ms=min(
                    WEEKLY_SLOWER_CAP, elapsed + rng.randrange(5_000, 90_000)
                ),
                at=_moment(rng, start, now),
            )
        )

    for index, name in enumerate(sprint_names):
        score = SPRINT_SCORES[index]
        elapsed = _sprint_elapsed(rng)
        fresh = name in sprint_active and rng.random() < 0.4
        at = _moment(rng, start, now) if fresh else _moment(rng, history_start, start)
        best = _row(
            name=name, score=score, total=sprint_total, elapsed_ms=elapsed, at=at
        )
        boards[("sprint", "ALL")].append(best)

        if name not in sprint_active:
            continue
        if fresh:
            boards[("sprint", "WEEK")].append(best)
            continue
        boards[("sprint", "WEEK")].append(
            _row(
                name=name,
                score=max(0, score - rng.randrange(1, 5)),
                total=sprint_total,
                elapsed_ms=_sprint_elapsed(rng),
                at=_moment(rng, start, now),
            )
        )

    for rows in boards.values():
        rows.sort(key=lambda row: row["rankKey"])
    return boards


# -------------------------------------------------------------------- dynamodb io


def to_item(mode: str, period: str, row: Row, ttl: Optional[int]) -> dict:
    item = {
        "PK": f"LB#{mode}#{period}",
        "SK": f"{row['rankKey']}#{row['sub']}",
        "sub": row["sub"],
        "name": row["name"],
        "score": row["score"],
        "total": row["total"],
        "elapsedMs": row["elapsedMs"],
        "at": row["at"],
    }
    if ttl is not None:
        item["ttl"] = ttl
    return item


def board_partitions(now: datetime) -> list[str]:
    """Every LB partition a demo row could be sitting in, current and recent."""
    partitions = []
    for mode in quiz.MODES:
        partitions.append(f"LB#{mode}#ALL")
        for back in range(PURGE_WEEKS):
            _, week = quiz.period_keys(now - timedelta(weeks=back))
            partitions.append(f"LB#{mode}#{week}")
    return partitions


def demo_rows_in(table, pk: str) -> list[dict]:
    from boto3.dynamodb.conditions import Key

    found: list[dict] = []
    kwargs: dict = {}
    while True:
        resp = table.query(KeyConditionExpression=Key("PK").eq(pk), **kwargs)
        for item in resp.get("Items", []):
            if str(item.get("sub", "")).startswith(DEMO_SUB_PREFIX):
                found.append(item)
        last = resp.get("LastEvaluatedKey")
        if not last:
            return found
        kwargs["ExclusiveStartKey"] = last


def purge(table, now: datetime, *, dry_run: bool) -> int:
    """Delete every row this tool has written, leaving real rows untouched."""
    doomed = [
        (item["PK"], item["SK"])
        for pk in board_partitions(now)
        for item in demo_rows_in(table, pk)
    ]
    if doomed and not dry_run:
        with table.batch_writer() as batch:
            for pk, sk in doomed:
                batch.delete_item(Key={"PK": pk, "SK": sk})
    return len(doomed)


# ------------------------------------------------------------------------ output


def print_board(mode: str, period: str, rows: list[Row]) -> None:
    label = "all time" if period == "ALL" else "this week"
    print(f"\n  {mode} / {label}  ({len(rows)} rows)")
    for rank, row in enumerate(rows, start=1):
        elapsed = row["elapsedMs"] / 1000
        time_col = f"{int(elapsed) // 60}:{int(elapsed) % 60:02d}"
        score = (
            f"{row['score']}"
            if mode == "sprint"
            else f"{row['score']}/{row['total']}"
        )
        print(f"    {rank:>2}. {row['name']:<12} {score:>6}  {time_col:>5}  {row['at']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default=None, help="AWS profile (default: env)")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--table", default=DEFAULT_TABLE)
    parser.add_argument(
        "--dry-run", action="store_true", help="print the boards, write nothing"
    )
    parser.add_argument(
        "--purge",
        action="store_true",
        help=f"delete every row whose sub starts with {DEMO_SUB_PREFIX!r} and stop",
    )
    args = parser.parse_args()

    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    now = quiz.utc_now()
    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    table = session.resource("dynamodb").Table(args.table)

    try:
        removed = purge(table, now, dry_run=args.dry_run)
    except (ClientError, BotoCoreError) as exc:
        print(f"ERROR: cannot read table {args.table}: {exc}", file=sys.stderr)
        return 1

    verb = "would remove" if args.dry_run else "removed"
    print(f"{verb} {removed} existing demo row(s)")
    if args.purge:
        if args.dry_run:
            print("dry run: nothing deleted")
        return 0

    boards = build_boards(now, random.Random(SEED))
    _, week = quiz.period_keys(now)
    ttl = quiz.weekly_ttl(now)

    written = 0
    items: list[dict] = []
    for (mode, period), rows in boards.items():
        resolved = "ALL" if period == "ALL" else week
        for row in rows:
            items.append(to_item(mode, resolved, row, ttl if period != "ALL" else None))
        print_board(mode, period, rows)
        written += len(rows)

    if args.dry_run:
        print(f"\ndry run: {written} row(s) not written")
        return 0

    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
    print(f"\nwrote {written} row(s) to {args.table}; the board cache clears in 60s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

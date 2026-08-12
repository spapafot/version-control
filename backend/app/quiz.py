"""Quiz rules: drawing a set of questions, scoring a submission, ranking it.

Pure logic, no boto3 and no clock of its own, so every rule below is unit
testable. ``routes/quiz.py`` supplies the bank, the current time and the RNG.

The one invariant worth stating up front: a bank question stores its options in
canonical order with the CORRECT ANSWER FIRST. A draw shuffles the options and
records the permutation on the session, so the correct answer never leaves the
server and each player sees the options in a different order.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Sequence

#: Authoring tiers. A run always draws a balanced spread across all three, so
#: this is never something a player picks or sees.
TIERS = ("easy", "medium", "hard")
MODES = ("sprint", "set20")

OPTION_COUNT = 4

#: Sprint deals a pool nobody can exhaust, because "answer as many as you can"
#: should be limited by the clock and not by us. Reaching 150 inside 3 minutes
#: would mean 1.2 seconds per question including reading four options, so the
#: cap stays out of reach even once the bank grows past it. Draws are clamped to
#: the bank size, so today a sprint deals the whole bank.
SPRINT_POOL = 150
SPRINT_DURATION_MS = 180_000

SET20_COUNT = 20
#: Not a race against the clock, just a ceiling so an abandoned session cannot
#: be submitted days later with a flattering elapsed time.
SET20_DURATION_MS = 600_000

#: Allowance for the round trip carrying the final answer.
SUBMIT_GRACE_MS = 5_000

#: Floor on the length of a whole run, not on the pace within it.
#:
#: There used to be a per-answer floor here. It was a mistake: sprint scores
#: precisely how fast you answer, so the check punished the improvement the quiz
#: exists to produce, and it silently dropped better runs from the board once
#: players started recognising repeats.
#:
#: The only thing this now guards is the Set of 20 board, where time breaks ties
#: and an instant scripted submission would park an unbeatable 0:00 at the top.
#: Twenty questions take a human twenty-odd seconds at minimum, so no real run
#: comes near ten. It does NOT stop someone who harvests answers across runs and
#: then paces their replies; nothing client-side can. What protects the board is
#: that the answers are not knowable ahead of a submit.
MIN_RUN_MS = 10_000

#: Cap on how long a weekly board sticks around after its week ends.
WEEKLY_RETENTION_DAYS = 14


class QuizError(Exception):
    """Bad mode/tier, or a bank too small to draw from."""


@dataclass(frozen=True)
class ModeSpec:
    count: int
    duration_ms: int


MODE_SPECS = {
    "sprint": ModeSpec(count=SPRINT_POOL, duration_ms=SPRINT_DURATION_MS),
    "set20": ModeSpec(count=SET20_COUNT, duration_ms=SET20_DURATION_MS),
}


def mode_spec(mode: str) -> ModeSpec:
    try:
        return MODE_SPECS[mode]
    except KeyError:
        raise QuizError(f"unknown mode {mode!r}") from None


@dataclass(frozen=True)
class Drawn:
    """One drawn question: the bank record plus the option order to show."""

    question: dict
    #: display position -> canonical option index. perm[i] == 0 marks the
    #: position holding the correct answer.
    perm: tuple[int, ...]

    def session_entry(self) -> dict:
        """The minimum the session item needs in order to score the answer."""
        return {"id": self.question["id"], "perm": list(self.perm)}

    def public_view(self) -> dict:
        """What a player is allowed to see.

        No correct index and no explanation, obviously. Also no tier: it decides
        the shape of the draw and is nobody's business afterwards.
        """
        options = [self.question["options"][i] for i in self.perm]
        return {
            "id": self.question["id"],
            "topic": self.question.get("topic"),
            "prompt": self.question["prompt"],
            "options": options,
        }


def _balanced_split(target: int, available: dict[str, int]) -> dict[str, int]:
    """Spread ``target`` across the tiers as evenly as the bank allows.

    Tiers short on questions give up their slots to tiers with spare, so a
    thin tier reduces balance rather than the size of the draw.
    """
    base, remainder = divmod(target, len(TIERS))
    want = {tier: base + (1 if i < remainder else 0) for i, tier in enumerate(TIERS)}
    take = {tier: min(want[tier], available.get(tier, 0)) for tier in TIERS}

    shortfall = target - sum(take.values())
    while shortfall > 0:
        spare = [t for t in TIERS if available.get(t, 0) > take[t]]
        if not spare:
            break
        for tier in spare:
            if shortfall == 0:
                break
            take[tier] += 1
            shortfall -= 1
    return take


def draw(
    bank: dict[str, Sequence[dict]],
    mode: str,
    rng: Optional[random.Random] = None,
) -> list[Drawn]:
    """Pick the questions for one run and decide each one's option order.

    ``bank`` maps tier -> questions. Every run gets the same balanced spread
    across the tiers, so scores are comparable by construction and a player
    never has to guess their own level before seeing a question. Difficulty is
    an authoring concern only; nothing about it reaches the player.

    The draw never repeats a question, and the number returned can be smaller
    than the mode's target when the bank is thin.
    """
    rng = rng or random.Random()
    target = mode_spec(mode).count

    available = {t: len(bank.get(t, ())) for t in TIERS}
    picked: list[dict] = []
    for tier, count in _balanced_split(target, available).items():
        picked.extend(rng.sample(list(bank.get(tier, ())), count))

    if not picked:
        raise QuizError("the question bank is empty")

    rng.shuffle(picked)
    drawn: list[Drawn] = []
    for question in picked:
        perm = list(range(len(question["options"])))
        rng.shuffle(perm)
        drawn.append(Drawn(question=question, perm=tuple(perm)))
    return drawn


@dataclass(frozen=True)
class Scored:
    score: int
    answered: int
    total: int
    #: question id -> display index the player chose (only answered ones)
    chosen: dict[str, int]
    #: question id -> display index that was correct
    correct: dict[str, int]

    @property
    def wrong(self) -> int:
        return self.answered - self.score


def score_answers(entries: Sequence[dict], answers: Iterable[dict]) -> Scored:
    """Score a submission against the permutations recorded on the session.

    Answers for questions the session never served are ignored, and a repeated
    answer for the same question keeps the last one, so a client that resends a
    changed choice is not penalised.
    """
    perms = {entry["id"]: list(entry["perm"]) for entry in entries}

    chosen: dict[str, int] = {}
    for answer in answers:
        qid = answer.get("id")
        choice = answer.get("choice")
        if qid not in perms or not isinstance(choice, int):
            continue
        if 0 <= choice < len(perms[qid]):
            chosen[qid] = choice

    correct_position = {qid: perm.index(0) for qid, perm in perms.items()}
    score = sum(1 for qid, choice in chosen.items() if choice == correct_position[qid])
    return Scored(
        score=score,
        answered=len(chosen),
        total=len(perms),
        chosen=chosen,
        correct=correct_position,
    )


def rank_key(score: int, elapsed_ms: int) -> str:
    """Sort key where lexicographic order IS rank order, best first.

    Both fields are fixed width and inverted where necessary, so a plain
    ascending Query on the leaderboard partition returns the top of the board
    without any sorting in the application.
    """
    if not 0 <= score <= 9999:
        raise QuizError(f"score {score} out of range")
    bounded = max(0, min(int(elapsed_ms), 99_999_999))
    return f"{9999 - score:04d}#{bounded:08d}"


def period_keys(now: datetime) -> tuple[str, str]:
    """The two boards a run can land on: all time, and the current ISO week."""
    iso = now.isocalendar()
    return "ALL", f"W{iso[0]:04d}-{iso[1]:02d}"


def weekly_ttl(now: datetime) -> int:
    """Epoch seconds at which this week's board rows may be dropped."""
    iso_weekday = now.isocalendar()[2]
    week_end = (now + timedelta(days=8 - iso_weekday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return int((week_end + timedelta(days=WEEKLY_RETENTION_DAYS)).timestamp())


def rank_verdict(
    *,
    signed_in: bool,
    elapsed_ms: int,
    duration_ms: int,
) -> Optional[str]:
    """Why this run cannot be ranked, or None when it can be.

    A run always gets its score and its review; ranking is the only thing at
    stake here, which is why the reasons are strings the UI can explain rather
    than errors.

    Note what is deliberately NOT checked: how fast the answers came. See
    MIN_RUN_MS.
    """
    if not signed_in:
        return "anonymous"
    if elapsed_ms > duration_ms + SUBMIT_GRACE_MS:
        return "expired"
    if elapsed_ms < MIN_RUN_MS:
        return "too_short"
    return None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_seconds(moment: datetime) -> str:
    """ISO 8601 with a Z suffix, matching the format used elsewhere in the app."""
    return moment.isoformat(timespec="seconds").replace("+00:00", "Z")

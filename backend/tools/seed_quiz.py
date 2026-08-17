#!/usr/bin/env python3
"""Load the question bank from src/quiz/bank/*.json into the vc-quiz table.

Run with your own AWS profile, not the Lambda role:

    python backend/tools/seed_quiz.py --dry-run
    python backend/tools/seed_quiz.py --profile default

The authoring JSON is the source of truth and DynamoDB is the serving copy.
Every rule enforced by src/quiz/quiz.test.ts is re-checked here, because a bad
bank must never reach the table: the site would serve it before anyone noticed.

The VERSION revision is bumped LAST, on purpose. Lambdas re-read the bank only
when that number changes, so a half-written bank is never picked up.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
BANK_DIR = REPO_ROOT / "src" / "quiz" / "bank"

DEFAULT_TABLE = "vc-quiz"
DEFAULT_REGION = "eu-central-1"

TIERS = ("easy", "medium", "hard")
MIN_PER_TIER = 20
OPTION_COUNT = 4

#: Mirrors SECTIONS in src/challenges/types.ts; one bank file per section.
TOPICS = (
    "terminal",
    "basics",
    "commits",
    "branches",
    "merge",
    "conflicts",
    "remotes",
    "undo",
    "stash",
    "final",
    "disasters",
)

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
BANNED_CHARS = re.compile(r"[-–‘’“”\n\r\t]")
FILLER_RE = re.compile(r"\b(none|all|both) of (the )?(above|these)\b", re.I)
ENUM_MARKER_RE = re.compile(r"^\s*\(?[a-d1-4][).]\s", re.I)

META_KEY = {"PK": "QBANK#META", "SK": "VERSION"}


class BankError(Exception):
    """The bank on disk is not fit to serve."""


# ------------------------------------------------------------------- validation


def _check_text(problems: list[str], qid: str, field: str, value: object) -> None:
    if not isinstance(value, str):
        problems.append(f"{qid}: {field} must be a string")
        return
    if BANNED_CHARS.search(value):
        problems.append(f"{qid}: {field} has an em/en dash, curly quote or newline")
    if value != value.strip():
        problems.append(f"{qid}: {field} has leading or trailing whitespace")
    if "  " in value:
        problems.append(f"{qid}: {field} has a double space")
    if any(unicodedata.category(ch)[0] == "C" for ch in value):
        problems.append(f"{qid}: {field} has a control character")


def load_bank(bank_dir: Path = BANK_DIR) -> list[dict]:
    """Read every topic file, stamping each question with its topic."""
    if not bank_dir.is_dir():
        raise BankError(f"no bank directory at {bank_dir}")

    found = sorted(p.stem for p in bank_dir.glob("*.json"))
    missing = sorted(set(TOPICS) - set(found))
    unknown = sorted(set(found) - set(TOPICS))
    if missing:
        raise BankError(f"missing topic files: {', '.join(missing)}")
    if unknown:
        raise BankError(f"unexpected topic files: {', '.join(unknown)}")

    questions: list[dict] = []
    for topic in TOPICS:
        raw = json.loads((bank_dir / f"{topic}.json").read_text(encoding="utf8"))
        if not isinstance(raw, list):
            raise BankError(f"{topic}.json: expected a JSON array")
        for question in raw:
            questions.append({**question, "topic": topic})
    return questions


def validate(questions: Iterable[dict]) -> None:
    """Raise BankError listing everything wrong, rather than the first problem."""
    problems: list[str] = []
    seen: dict[str, str] = {}
    prompts: dict[str, str] = {}
    per_tier = {tier: 0 for tier in TIERS}

    for question in questions:
        qid = question.get("id", "<no id>")
        if not isinstance(qid, str) or not ID_RE.match(qid):
            problems.append(f"{qid}: id must be kebab-case")
        if qid in seen:
            problems.append(f"{qid}: duplicate id (also in {seen[qid]})")
        seen[qid] = question.get("topic", "?")

        tier = question.get("tier")
        if tier not in TIERS:
            problems.append(f"{qid}: unknown tier {tier!r}")
        else:
            per_tier[tier] += 1

        prompt = question.get("prompt", "")
        _check_text(problems, qid, "prompt", prompt)
        if isinstance(prompt, str):
            if not 40 <= len(prompt) <= 320:
                problems.append(f"{qid}: prompt must be 40-320 chars, is {len(prompt)}")
            key = prompt.lower().strip()
            if key in prompts:
                problems.append(f"{qid}: same prompt as {prompts[key]}")
            prompts[key] = qid

        explanation = question.get("explanation", "")
        _check_text(problems, qid, "explanation", explanation)
        if isinstance(explanation, str) and not 40 <= len(explanation) <= 400:
            problems.append(
                f"{qid}: explanation must be 40-400 chars, is {len(explanation)}"
            )

        options = question.get("options")
        if not isinstance(options, list) or len(options) != OPTION_COUNT:
            problems.append(f"{qid}: needs exactly {OPTION_COUNT} options")
            continue
        for index, option in enumerate(options):
            _check_text(problems, qid, f"options[{index}]", option)
            if not isinstance(option, str):
                continue
            if not 6 <= len(option) <= 160:
                problems.append(f"{qid}: option {index} must be 6-160 chars")
            if FILLER_RE.search(option):
                problems.append(f"{qid}: option {index} is a filler distractor")
            if ENUM_MARKER_RE.match(option):
                problems.append(f"{qid}: option {index} carries its own a/b/c/d marker")
        if len({o.strip() for o in options if isinstance(o, str)}) != OPTION_COUNT:
            problems.append(f"{qid}: options repeat each other")
        if all(isinstance(o, str) for o in options):
            longest_distractor = max(len(o) for o in options[1:])
            if len(options[0]) > longest_distractor + 30:
                problems.append(
                    f"{qid}: correct answer is conspicuously longer than the distractors"
                )

    for tier, count in per_tier.items():
        if count < MIN_PER_TIER:
            problems.append(
                f"tier {tier} has {count} questions, at least {MIN_PER_TIER} are needed"
            )

    if problems:
        raise BankError(
            f"{len(problems)} problem(s) in the bank:\n  " + "\n  ".join(problems)
        )


# ------------------------------------------------------------------- dynamodb io


def to_item(question: dict) -> dict:
    item = {
        "PK": f"QBANK#{question['tier']}",
        "SK": f"Q#{question['id']}",
        "id": question["id"],
        "tier": question["tier"],
        "topic": question["topic"],
        "prompt": question["prompt"],
        # Canonical order: options[0] is the correct answer. The API shuffles
        # per session, so this order is never what a player sees.
        "options": list(question["options"]),
        "explanation": question["explanation"],
    }
    if question.get("challenge"):
        item["challenge"] = question["challenge"]
    return item


def existing_items(table) -> dict[tuple[str, str], dict]:
    from boto3.dynamodb.conditions import Key

    found: dict[tuple[str, str], dict] = {}
    for tier in TIERS:
        kwargs: dict = {}
        while True:
            resp = table.query(
                KeyConditionExpression=Key("PK").eq(f"QBANK#{tier}"), **kwargs
            )
            for item in resp.get("Items", []):
                if str(item.get("SK", "")).startswith("Q#"):
                    found[(item["PK"], item["SK"])] = item
            last = resp.get("LastEvaluatedKey")
            if not last:
                break
            kwargs["ExclusiveStartKey"] = last
    return found


def comparable(item: dict) -> dict:
    """The fields that decide whether a stored question needs rewriting."""
    return {
        key: item.get(key)
        for key in ("id", "tier", "topic", "prompt", "options", "explanation", "challenge")
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default=None, help="AWS profile (default: env)")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--table", default=DEFAULT_TABLE)
    parser.add_argument("--bank-dir", default=str(BANK_DIR))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and print the diff without writing anything",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="check the bank on disk and stop; touches no AWS credentials at all",
    )
    args = parser.parse_args()

    try:
        questions = load_bank(Path(args.bank_dir))
        validate(questions)
    except BankError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    counts = {tier: sum(1 for q in questions if q["tier"] == tier) for tier in TIERS}
    print(f"bank: {len(questions)} questions", end="  ")
    print("  ".join(f"{tier} {counts[tier]}" for tier in TIERS))

    if args.validate_only:
        print("bank is valid; --validate-only, so nothing was read or written")
        return 0

    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    table = session.resource("dynamodb").Table(args.table)

    try:
        stored = existing_items(table)
    except (ClientError, BotoCoreError) as exc:
        # Validating the bank before the table exists is a normal thing to want
        # (it is the step right before 15-create-quiz-dynamodb.sh), so a dry run
        # reports what it managed to check instead of failing.
        if args.dry_run:
            print(f"bank is valid, but table {args.table} could not be read: {exc}")
            print("dry run: validation only, nothing written")
            return 0
        print(f"ERROR: cannot read table {args.table}: {exc}", file=sys.stderr)
        print(
            "Create it first with scripts/aws/15-create-quiz-dynamodb.sh, or pass "
            "--validate-only to check the bank alone.",
            file=sys.stderr,
        )
        return 1

    wanted = {(i["PK"], i["SK"]): i for i in (to_item(q) for q in questions)}

    added = [k for k in wanted if k not in stored]
    removed = [k for k in stored if k not in wanted]
    changed = [
        k
        for k in wanted
        if k in stored and comparable(stored[k]) != comparable(wanted[k])
    ]
    unchanged = len(wanted) - len(added) - len(changed)

    print(
        f"table {args.table}: +{len(added)} added, ~{len(changed)} changed, "
        f"-{len(removed)} removed, {unchanged} unchanged"
    )
    for key in sorted(added):
        print(f"  + {key[1][2:]}")
    for key in sorted(changed):
        print(f"  ~ {key[1][2:]}")
    for key in sorted(removed):
        print(f"  - {key[1][2:]}")

    if args.dry_run:
        print("dry run: nothing written")
        return 0

    if not added and not changed and not removed:
        print("nothing to do; leaving the revision untouched")
        return 0

    with table.batch_writer() as batch:
        for key in added + changed:
            batch.put_item(Item=wanted[key])
        for key in removed:
            batch.delete_item(Key={"PK": key[0], "SK": key[1]})

    # Last, so no Lambda reloads a partially written bank.
    current = table.get_item(Key=META_KEY).get("Item") or {}
    revision = int(current.get("rev", 0)) + 1
    table.put_item(
        Item={**META_KEY, "rev": revision, "counts": counts, "total": len(questions)}
    )
    print(f"wrote revision {revision}; warm Lambdas pick it up within 5 minutes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

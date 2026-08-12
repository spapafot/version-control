"""DynamoDB access for the quiz table — separate table, separate Table handle.

Item layout (PK / SK):
  QBANK#{tier}       / Q#{id}                {id, tier, topic, prompt, options,
                                              explanation, challenge?}
  QBANK#META         / VERSION               {rev, counts}
  SESSION#{sid}      / SESSION               {mode, bankRev, questions, sub?,
                                              startedAt, startedAtMs,
                                              expiresAtMs, submittedAt?, ttl}
  LB#{mode}#{period} / {rankKey}#{sub}       {sub, name, score, total,
                                              elapsedMs, at, ttl?}
                                             (name is the player's NICKNAME, not
                                              the name on their certificate)
  USER#{sub}         / BEST#{mode}#{period}  {rankKey, score, total, elapsedMs,
                                              at}
  USER#{sub}         / STATS                 {attempts, answered, correct}

Two design notes worth keeping in mind before changing anything here:

* There are no secondary indexes, deliberately. A leaderboard read is one
  single-partition Query whose sort key already encodes rank (see
  ``quiz.rank_key``), so a GSI would add an IAM resource and a consistency
  window in exchange for nothing.
* The question bank is cached in module memory across warm invocations and
  re-checked against the VERSION item at most every few minutes, so a re-seed
  reaches production without a redeploy and without a read per request.
"""

from __future__ import annotations

import time
from decimal import Decimal
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from .config import get_settings
from .quiz import TIERS

BANK_META_PK = "QBANK#META"
BANK_META_SK = "VERSION"

#: How long a warm Lambda trusts its cached bank before re-reading VERSION.
BANK_RECHECK_SECONDS = 300

#: Sessions are scratch data; keep them a day for debugging, then let TTL reap.
SESSION_TTL_SECONDS = 86_400

_table = None
_bank: Optional["Bank"] = None
_bank_checked_at = 0.0


class SessionNotFound(Exception):
    """No session with that id, or it has already expired out of the table."""


class SessionAlreadySubmitted(Exception):
    """This session has been scored once already; runs are single use."""


class BestWriteConflict(Exception):
    """Another submission for the same board landed first; re-read and retry."""


class Bank:
    """An immutable snapshot of the question bank at one revision."""

    __slots__ = ("rev", "by_tier", "by_id")

    def __init__(self, rev: int, questions: list[dict]):
        self.rev = rev
        self.by_tier: dict[str, list[dict]] = {tier: [] for tier in TIERS}
        self.by_id: dict[str, dict] = {}
        for question in questions:
            self.by_id[question["id"]] = question
            self.by_tier.setdefault(question["tier"], []).append(question)

    def __len__(self) -> int:
        return len(self.by_id)

    def counts(self) -> dict[str, int]:
        return {tier: len(items) for tier, items in self.by_tier.items()}


def get_table():
    global _table
    if _table is None:
        settings = get_settings()
        _table = boto3.resource("dynamodb", region_name=settings.aws_region).Table(
            settings.quiz_table_name
        )
    return _table


def reset() -> None:
    """Drop the cached Table handle and the bank cache (tests recreate both)."""
    global _table, _bank, _bank_checked_at
    _table = None
    _bank = None
    _bank_checked_at = 0.0


def _clean(value):
    """Recursively convert DynamoDB Decimals back to ints (we only store ints)."""
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _query_all(pk: str) -> list[dict]:
    """Query one partition, following pagination to the end."""
    items: list[dict] = []
    kwargs: dict = {}
    while True:
        resp = get_table().query(KeyConditionExpression=Key("PK").eq(pk), **kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            return [_clean(item) for item in items]
        kwargs["ExclusiveStartKey"] = last


# ---------------------------------------------------------------- question bank


def bank_revision() -> int:
    """The seeder's revision counter, or 0 when the bank has never been seeded."""
    resp = get_table().get_item(Key={"PK": BANK_META_PK, "SK": BANK_META_SK})
    item = resp.get("Item")
    return int(item.get("rev", 0)) if item else 0


def _question_from_item(item: dict) -> dict:
    """Project a stored item down to the fields the quiz logic reads."""
    question = {
        "id": item["id"],
        "tier": item["tier"],
        "topic": item.get("topic"),
        "prompt": item["prompt"],
        "options": list(item["options"]),
        "explanation": item.get("explanation", ""),
    }
    if item.get("challenge"):
        question["challenge"] = item["challenge"]
    return question


def load_bank() -> Bank:
    """Read every question out of the tier partitions. Bypasses the cache."""
    rev = bank_revision()
    questions: list[dict] = []
    for tier in TIERS:
        for item in _query_all(f"QBANK#{tier}"):
            if item.get("SK", "").startswith("Q#"):
                questions.append(_question_from_item(item))
    return Bank(rev=rev, questions=questions)


def get_bank() -> Bank:
    """The cached bank, refreshed only when VERSION says the content changed.

    Costs one GetItem per container per BANK_RECHECK_SECONDS in the steady
    state, and three Queries when a re-seed has actually happened.
    """
    global _bank, _bank_checked_at
    now = time.monotonic()
    if _bank is not None and now - _bank_checked_at < BANK_RECHECK_SECONDS:
        return _bank

    if _bank is None:
        _bank = load_bank()
    elif bank_revision() != _bank.rev:
        _bank = load_bank()
    _bank_checked_at = now
    return _bank


# -------------------------------------------------------------------- sessions


def put_session(item: dict) -> None:
    get_table().put_item(Item=item)


def get_session(session_id: str) -> dict:
    resp = get_table().get_item(Key={"PK": f"SESSION#{session_id}", "SK": "SESSION"})
    item = resp.get("Item")
    if item is None:
        raise SessionNotFound()
    return _clean(item)


def claim_session(session_id: str, submitted_at: str) -> None:
    """Stamp the session as submitted, exactly once.

    The conditional write is what makes a run single use: a second submission
    (a double-clicked button, or a replay attempt) loses the race and raises.
    """
    try:
        get_table().update_item(
            Key={"PK": f"SESSION#{session_id}", "SK": "SESSION"},
            UpdateExpression="SET #submittedAt = :at",
            ExpressionAttributeNames={"#submittedAt": "submittedAt"},
            ExpressionAttributeValues={":at": submitted_at},
            ConditionExpression="attribute_exists(PK) AND attribute_not_exists(#submittedAt)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise SessionAlreadySubmitted() from exc
        raise


# ----------------------------------------------------------------- leaderboards


def top_scores(mode: str, period: str, limit: int) -> list[dict]:
    """The top ``limit`` rows of one board, best first.

    No sorting here: the sort key is built so that ascending key order is
    descending score order, and exactly one row per player exists per board.
    """
    resp = get_table().query(
        KeyConditionExpression=Key("PK").eq(f"LB#{mode}#{period}"),
        Limit=limit,
        ScanIndexForward=True,
    )
    return [_clean(item) for item in resp.get("Items", [])]


def get_best(sub: str, mode: str, period: str) -> Optional[dict]:
    resp = get_table().get_item(
        Key={"PK": f"USER#{sub}", "SK": f"BEST#{mode}#{period}"}
    )
    item = resp.get("Item")
    return _clean(item) if item else None


def record_best(
    *,
    sub: str,
    mode: str,
    period: str,
    rank_key: str,
    previous_rank_key: Optional[str],
    score: int,
    total: int,
    elapsed_ms: int,
    at: str,
    name: str,
    ttl: Optional[int] = None,
) -> None:
    """Install a new personal best on one board, atomically.

    Three writes in one transaction keep the invariant that a board holds
    exactly one row per player: advance the BEST pointer, add the new row, and
    retire the row the pointer used to name. The condition on the pointer is
    what makes concurrent submissions safe; the loser raises
    ``BestWriteConflict`` and the caller re-reads.
    """
    settings = get_settings()
    table_name = settings.quiz_table_name
    lb_pk = f"LB#{mode}#{period}"

    best_update = {
        "Update": {
            "TableName": table_name,
            "Key": {"PK": f"USER#{sub}", "SK": f"BEST#{mode}#{period}"},
            "UpdateExpression": (
                "SET #rankKey = :rk, #score = :score, #total = :total, "
                "#elapsedMs = :elapsed, #at = :at"
            ),
            # Every name is aliased: DynamoDB's reserved word list is long and
            # "total" is on it.
            "ExpressionAttributeNames": {
                "#rankKey": "rankKey",
                "#score": "score",
                "#total": "total",
                "#elapsedMs": "elapsedMs",
                "#at": "at",
            },
            "ExpressionAttributeValues": {
                ":rk": rank_key,
                ":score": score,
                ":total": total,
                ":elapsed": elapsed_ms,
                ":at": at,
            },
            "ConditionExpression": (
                "attribute_not_exists(#rankKey)"
                if previous_rank_key is None
                else "#rankKey = :prev"
            ),
        }
    }
    if previous_rank_key is not None:
        best_update["Update"]["ExpressionAttributeValues"][":prev"] = previous_rank_key

    row = {
        "PK": lb_pk,
        "SK": f"{rank_key}#{sub}",
        "sub": sub,
        "name": name,
        "score": score,
        "total": total,
        "elapsedMs": elapsed_ms,
        "at": at,
    }
    if ttl is not None:
        row["ttl"] = ttl

    items = [best_update, {"Put": {"TableName": table_name, "Item": row}}]
    if previous_rank_key is not None and previous_rank_key != rank_key:
        items.append(
            {
                "Delete": {
                    "TableName": table_name,
                    "Key": {"PK": lb_pk, "SK": f"{previous_rank_key}#{sub}"},
                }
            }
        )

    try:
        get_table().meta.client.transact_write_items(TransactItems=items)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        codes = [
            (reason or {}).get("Code")
            for reason in exc.response.get("CancellationReasons") or []
        ]
        if "ConditionalCheckFailed" in codes:
            raise BestWriteConflict() from exc
        raise


def bump_stats(sub: str, *, answered: int, correct: int) -> None:
    """Lifetime counters. ADD is atomic, so concurrent runs cannot lose a tick."""
    get_table().update_item(
        Key={"PK": f"USER#{sub}", "SK": "STATS"},
        UpdateExpression="ADD #attempts :one, #answered :answered, #correct :correct",
        ExpressionAttributeNames={
            "#attempts": "attempts",
            "#answered": "answered",
            "#correct": "correct",
        },
        ExpressionAttributeValues={
            ":one": 1,
            ":answered": answered,
            ":correct": correct,
        },
    )


def get_user_quiz_items(sub: str) -> list[dict]:
    """Every quiz item belonging to one user: the BEST pointers and STATS.

    Also the list a GDPR erasure walks, together with the LB rows the pointers
    name (see the runbook in scripts/aws/README.md).
    """
    return _query_all(f"USER#{sub}")

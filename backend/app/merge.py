"""Sanitize + monotone merge of course progress - the sync contract.

``merge(server, client)`` is a join over {completed, hintsUsed, achievements}:
  - completed:    min timestamp per key (earliest completion wins)
  - hintsUsed:    max per key
  - achievements: sorted union

Both inputs are sanitized against the course snapshot before joining, which
makes the operation commutative, associative and idempotent regardless of
which side the data came from.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

_DATA_PATH = Path(__file__).resolve().parent / "data" / "challenges.json"
SNAPSHOT = json.loads(_DATA_PATH.read_text(encoding="utf-8"))

SECTIONS = SNAPSHOT["sections"]
ALL_SLUGS = [slug for section in SECTIONS for slug in section["slugs"]]
SLUG_SET = frozenset(ALL_SLUGS)
ACHIEVEMENTS = list(SNAPSHOT["achievements"])
ACHIEVEMENT_SET = frozenset(ACHIEVEMENTS)

assert len(ALL_SLUGS) == SNAPSHOT["total"] == 77, (
    "challenges.json snapshot out of sync: "
    f"{len(ALL_SLUGS)} slugs vs total={SNAPSHOT['total']} (expected 77)"
)

FLOOR = datetime(2025, 1, 1, tzinfo=timezone.utc)  # course launch
FLOOR_STR = "2025-01-01T00:00:00Z"
FUTURE_SLACK = timedelta(minutes=5)
MAX_HINTS = 10


def _parse_ts(value) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _format_ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_hint(value) -> Optional[int]:
    if isinstance(value, bool):
        n = int(value)
    elif isinstance(value, int):
        n = value
    elif isinstance(value, float):
        if not value.is_integer():
            return None
        n = int(value)
    elif isinstance(value, str):
        try:
            n = int(value.strip())
        except ValueError:
            return None
    else:
        return None
    if n < 0:
        return None
    return min(n, MAX_HINTS)


def sanitize(blob) -> dict:
    """Whitelist keys, normalize timestamps to UTC ...Z, clamp values."""
    if not isinstance(blob, dict):
        blob = {}
    now = datetime.now(timezone.utc)

    completed: dict = {}
    raw_completed = blob.get("completed")
    if isinstance(raw_completed, dict):
        for slug, ts in raw_completed.items():
            if slug not in SLUG_SET:
                continue
            dt = _parse_ts(ts)
            if dt is None:
                continue
            if dt > now + FUTURE_SLACK:
                dt = now
            if dt < FLOOR:
                dt = FLOOR
            completed[slug] = _format_ts(dt)

    hints: dict = {}
    raw_hints = blob.get("hintsUsed")
    if isinstance(raw_hints, dict):
        for slug, value in raw_hints.items():
            if slug not in SLUG_SET:
                continue
            n = _coerce_hint(value)
            if n is None:
                continue
            hints[slug] = n

    achievements: set = set()
    raw_achievements = blob.get("achievements")
    if isinstance(raw_achievements, (list, tuple)):
        for a in raw_achievements:
            if isinstance(a, str) and a in ACHIEVEMENT_SET:
                achievements.add(a)

    return {
        "completed": {k: completed[k] for k in sorted(completed)},
        "hintsUsed": {k: hints[k] for k in sorted(hints)},
        "achievements": sorted(achievements),
    }


def merge(server: Optional[dict], client: dict) -> dict:
    """Monotone merge of two progress blobs (either side may be dirty)."""
    a = sanitize(server)
    b = sanitize(client)

    completed: dict = {}
    for slug in sorted(set(a["completed"]) | set(b["completed"])):
        candidates = [
            _parse_ts(side["completed"][slug])
            for side in (a, b)
            if slug in side["completed"]
        ]
        completed[slug] = _format_ts(min(candidates))

    hints: dict = {}
    for slug in sorted(set(a["hintsUsed"]) | set(b["hintsUsed"])):
        hints[slug] = max(
            side["hintsUsed"][slug] for side in (a, b) if slug in side["hintsUsed"]
        )

    achievements = sorted(set(a["achievements"]) | set(b["achievements"]))

    return {"completed": completed, "hintsUsed": hints, "achievements": achievements}

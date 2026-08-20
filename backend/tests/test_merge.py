"""Merge/sanitize contract + course snapshot totals."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from app.merge import ACHIEVEMENTS, ALL_SLUGS, SNAPSHOT, merge, sanitize

A_SLUG = "first-repository"
B_SLUG = "check-status"


def _blob(completed=None, hints=None, achievements=None):
    return {
        "completed": completed or {},
        "hintsUsed": hints or {},
        "achievements": achievements or [],
    }


def test_min_max_union_both_orders():
    a = _blob(
        completed={A_SLUG: "2025-03-01T10:00:00Z"},
        hints={A_SLUG: 2},
        achievements=["merge-master"],
    )
    b = _blob(
        completed={A_SLUG: "2025-02-01T10:00:00Z", B_SLUG: "2025-04-05T08:30:00Z"},
        hints={A_SLUG: 5, B_SLUG: 1},
        achievements=["first-commit"],
    )
    ab = merge(a, b)
    ba = merge(b, a)
    assert ab == ba
    assert ab["completed"][A_SLUG] == "2025-02-01T10:00:00Z"  # min wins
    assert ab["completed"][B_SLUG] == "2025-04-05T08:30:00Z"
    assert ab["hintsUsed"] == {A_SLUG: 5, B_SLUG: 1}  # max wins
    assert ab["achievements"] == ["first-commit", "merge-master"]  # sorted union


def test_idempotent():
    a = _blob(
        completed={A_SLUG: "2025-03-01T10:00:00Z"},
        hints={B_SLUG: 3},
        achievements=["time-traveler"],
    )
    once = merge(None, a)
    assert merge(once, once) == once
    assert merge(once, a) == once


def test_associative():
    a = _blob(completed={A_SLUG: "2025-03-01T10:00:00Z"}, achievements=["first-commit"])
    b = _blob(completed={A_SLUG: "2025-02-01T10:00:00Z"}, hints={A_SLUG: 4})
    c = _blob(completed={B_SLUG: "2025-05-01T10:00:00Z"}, hints={A_SLUG: 9})
    assert merge(merge(a, b), c) == merge(a, merge(b, c))


def test_commutative_randomized():
    rng = random.Random(20260811)
    pool = ALL_SLUGS[:12] + ["not-a-real-slug", "also-fake"]
    ach_pool = ACHIEVEMENTS[:6] + ["fake-achievement"]
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)

    def random_blob():
        completed = {}
        for slug in rng.sample(pool, rng.randint(0, len(pool))):
            dt = base + timedelta(minutes=rng.randint(-100_000, 500_000))
            completed[slug] = dt.isoformat().replace("+00:00", "Z")
        hints = {
            slug: rng.randint(-3, 15)
            for slug in rng.sample(pool, rng.randint(0, len(pool)))
        }
        achievements = rng.sample(ach_pool, rng.randint(0, len(ach_pool)))
        return _blob(completed, hints, achievements)

    for _ in range(30):
        a, b = random_blob(), random_blob()
        assert merge(a, b) == merge(b, a)


def test_whitelist_drops():
    dirty = _blob(
        completed={"totally-fake": "2025-03-01T10:00:00Z", A_SLUG: "2025-03-01T10:00:00Z"},
        hints={"another-fake": 3, A_SLUG: 2},
        achievements=["not-an-achievement", "first-commit"],
    )
    merged = merge(None, dirty)
    assert set(merged["completed"]) == {A_SLUG}
    assert set(merged["hintsUsed"]) == {A_SLUG}
    assert merged["achievements"] == ["first-commit"]


def test_future_timestamp_clamped_to_now():
    before = datetime.now(timezone.utc)
    future = (before + timedelta(days=30)).isoformat().replace("+00:00", "Z")
    merged = merge(None, _blob(completed={A_SLUG: future}))
    clamped = datetime.fromisoformat(merged["completed"][A_SLUG].replace("Z", "+00:00"))
    after = datetime.now(timezone.utc)
    assert before - timedelta(seconds=1) <= clamped <= after + timedelta(minutes=5)


def test_pre_launch_timestamp_clamped_to_floor():
    merged = merge(None, _blob(completed={A_SLUG: "2024-06-15T12:00:00Z"}))
    assert merged["completed"][A_SLUG] == "2025-01-01T00:00:00Z"


def test_malformed_iso_dropped():
    merged = merge(
        None,
        _blob(
            completed={
                A_SLUG: "not-a-date",
                B_SLUG: 12345,
                "spot-the-change": "2025-13-45T99:99:99Z",
            }
        ),
    )
    assert merged["completed"] == {}


def test_naive_timestamp_treated_as_utc():
    merged = merge(None, _blob(completed={A_SLUG: "2025-03-01T10:00:00"}))
    assert merged["completed"][A_SLUG] == "2025-03-01T10:00:00Z"


def test_hint_coercion_and_clamp():
    merged = merge(
        None,
        _blob(
            hints={
                A_SLUG: 99,  # clamped to 10
                B_SLUG: "3",  # coerced
                "spot-the-change": -1,  # dropped
                "two-kinds-of-change": 2.5,  # dropped (non-integral)
                "stage-everything": "boom",  # dropped
            }
        ),
    )
    assert merged["hintsUsed"] == {A_SLUG: 10, B_SLUG: 3}


def test_sanitize_normalizes_offset_to_utc():
    out = sanitize(_blob(completed={A_SLUG: "2025-03-01T12:00:00+02:00"}))
    assert out["completed"][A_SLUG] == "2025-03-01T10:00:00Z"


def test_snapshot_totals():
    assert SNAPSHOT["total"] == 78
    assert len(ALL_SLUGS) == 78
    assert len(set(ALL_SLUGS)) == 78
    assert sum(len(s["slugs"]) for s in SNAPSHOT["sections"]) == 78
    assert len(SNAPSHOT["sections"]) == 11
    assert [len(s["slugs"]) for s in SNAPSHOT["sections"]] == [8, 7, 8, 7, 8, 5, 8, 8, 5, 6, 8]
    assert len(ACHIEVEMENTS) == 13

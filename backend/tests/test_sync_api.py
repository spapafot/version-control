"""POST /v1/sync: first sync, multi-device merge, optimistic locking."""

from __future__ import annotations


def _payload(completed=None, hints=None, achievements=None):
    return {
        "completed": completed or {},
        "hintsUsed": hints or {},
        "achievements": achievements or [],
    }


def test_first_sync_creates_progress_and_profile(client, auth_headers):
    headers = auth_headers(sub="sync-user-1", email="one@example.com")
    resp = client.post(
        "/v1/sync",
        json=_payload(
            completed={"first-repository": "2025-05-01T12:00:00Z"},
            hints={"first-repository": 3},
            achievements=["first-commit"],
        ),
        headers=headers,
    )
    assert resp.status_code == 200
    progress = resp.json()["progress"]
    assert progress["completed"] == {"first-repository": "2025-05-01T12:00:00Z"}
    assert progress["hintsUsed"] == {"first-repository": 3}
    assert progress["achievements"] == ["first-commit"]

    from app import db

    stored = db.get_progress("sync-user-1")
    assert stored is not None and stored["v"] == 1
    profile = db.get_profile("sync-user-1")
    assert profile is not None and profile["email"] == "one@example.com"
    assert "createdAt" in profile


def test_two_device_union(client, auth_headers):
    headers = auth_headers(sub="sync-user-2", email="two@example.com")
    device_a = _payload(
        completed={"first-repository": "2025-05-01T12:00:00Z"},
        hints={"first-repository": 2},
        achievements=["first-commit"],
    )
    device_b = _payload(
        completed={
            "first-repository": "2025-05-02T09:00:00Z",  # later — min keeps device A's
            "check-status": "2025-05-02T10:00:00Z",
        },
        hints={"first-repository": 7},
        achievements=["diff-detective"],
    )
    assert client.post("/v1/sync", json=device_a, headers=headers).status_code == 200
    resp = client.post("/v1/sync", json=device_b, headers=headers)
    assert resp.status_code == 200
    progress = resp.json()["progress"]
    assert progress["completed"] == {
        "first-repository": "2025-05-01T12:00:00Z",
        "check-status": "2025-05-02T10:00:00Z",
    }
    assert progress["hintsUsed"] == {"first-repository": 7}
    assert progress["achievements"] == ["diff-detective", "first-commit"]


def test_conditional_write_retry(client, auth_headers, monkeypatch):
    from app import db

    real_put = db.put_progress_conditional
    calls = {"count": 0}

    def flaky(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise db.ConditionalWriteFailed()
        return real_put(*args, **kwargs)

    monkeypatch.setattr(db, "put_progress_conditional", flaky)

    headers = auth_headers(sub="sync-user-3", email="three@example.com")
    resp = client.post(
        "/v1/sync",
        json=_payload(completed={"first-repository": "2025-05-01T12:00:00Z"}),
        headers=headers,
    )
    assert resp.status_code == 200
    assert calls["count"] == 2  # one forced conflict, then success

    stored = db.get_progress("sync-user-3")
    assert stored is not None and stored["v"] == 1


def test_noop_sync_leaves_version_unchanged(client, auth_headers):
    headers = auth_headers(sub="sync-user-4", email="four@example.com")
    payload = _payload(
        completed={"first-repository": "2025-05-01T12:00:00Z"},
        hints={"check-status": 4},
        achievements=["first-commit"],
    )
    first = client.post("/v1/sync", json=payload, headers=headers)
    assert first.status_code == 200

    from app import db

    assert db.get_progress("sync-user-4")["v"] == 1

    second = client.post("/v1/sync", json=payload, headers=headers)
    assert second.status_code == 200
    assert second.json()["progress"] == first.json()["progress"]
    assert db.get_progress("sync-user-4")["v"] == 1  # no write happened

    # a strict subset is also a no-op
    subset = _payload(completed={"first-repository": "2025-05-01T12:00:00Z"})
    third = client.post("/v1/sync", json=subset, headers=headers)
    assert third.status_code == 200
    assert db.get_progress("sync-user-4")["v"] == 1


def test_sync_sanitizes_client_junk(client, auth_headers):
    headers = auth_headers(sub="sync-user-5", email="five@example.com")
    resp = client.post(
        "/v1/sync",
        json=_payload(
            completed={"fake-slug": "2025-05-01T12:00:00Z", "check-status": "garbage"},
            hints={"first-repository": 99},
            achievements=["nope", "first-commit"],
        ),
        headers=headers,
    )
    assert resp.status_code == 200
    progress = resp.json()["progress"]
    assert progress["completed"] == {}
    assert progress["hintsUsed"] == {"first-repository": 10}
    assert progress["achievements"] == ["first-commit"]

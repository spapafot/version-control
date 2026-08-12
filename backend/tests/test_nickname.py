"""The two names on a profile, and how they stay out of each other's way.

displayName is printed on the certificate and is likely a real name.
nickname is published on the quiz leaderboards. Editing one must never touch
the other, because they are set from different screens for different reasons.
"""

from __future__ import annotations

from app.routes.me import NICKNAME_MAX, NICKNAME_MIN


def _headers(auth_headers, sub="nick-user"):
    return auth_headers(sub=sub, email=f"{sub}@example.com")


class TestValidation:
    def test_a_plain_nickname_is_accepted(self, client, ddb_table, auth_headers):
        resp = client.put(
            "/v1/me", json={"nickname": "git-goblin"}, headers=_headers(auth_headers)
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["profile"]["nickname"] == "git-goblin"

    def test_whitespace_is_collapsed_and_trimmed(self, client, ddb_table, auth_headers):
        resp = client.put(
            "/v1/me", json={"nickname": "  git   goblin  "}, headers=_headers(auth_headers)
        )
        assert resp.json()["profile"]["nickname"] == "git goblin"

    def test_empty_and_punctuation_only_are_rejected(
        self, client, ddb_table, auth_headers
    ):
        for bad in ["", " ", "!!!", "---", "  ..  "]:
            resp = client.put(
                "/v1/me", json={"nickname": bad}, headers=_headers(auth_headers)
            )
            assert resp.status_code == 400, bad
            assert resp.json()["code"] == "invalid_nickname"

    def test_length_bounds(self, client, ddb_table, auth_headers):
        headers = _headers(auth_headers)
        too_short = "a" * (NICKNAME_MIN - 1)
        too_long = "a" * (NICKNAME_MAX + 1)
        for bad in (too_short, too_long):
            resp = client.put("/v1/me", json={"nickname": bad}, headers=headers)
            assert resp.status_code == 400, bad
            assert resp.json()["code"] == "invalid_nickname"

        for ok in ("a" * NICKNAME_MIN, "a" * NICKNAME_MAX):
            resp = client.put("/v1/me", json={"nickname": ok}, headers=headers)
            assert resp.status_code == 200, ok

    def test_control_characters_are_stripped(self, client, ddb_table, auth_headers):
        # A left-to-right mark and a bell: invisible in a board row, and exactly
        # the sort of thing someone pads a nickname with.
        resp = client.put(
            "/v1/me",
            json={"nickname": "git‎goblin"},
            headers=_headers(auth_headers),
        )
        assert resp.status_code == 200
        assert resp.json()["profile"]["nickname"] == "gitgoblin"

    def test_a_body_with_neither_field_is_rejected(self, client, ddb_table, auth_headers):
        resp = client.put("/v1/me", json={}, headers=_headers(auth_headers))
        assert resp.status_code == 400
        assert resp.json()["code"] == "nothing_to_update"

    def test_nicknames_need_not_be_unique(self, client, ddb_table, auth_headers):
        # Two accounts, one nickname. Rows stay tied to an account, so this is
        # cosmetic rather than an identity clash.
        for sub in ("nick-a", "nick-b"):
            resp = client.put(
                "/v1/me", json={"nickname": "same-name"}, headers=_headers(auth_headers, sub)
            )
            assert resp.status_code == 200


class TestIndependence:
    def test_setting_a_nickname_leaves_the_certificate_name_alone(
        self, client, ddb_table, auth_headers
    ):
        headers = _headers(auth_headers)
        client.put("/v1/me", json={"displayName": "Ada Lovelace"}, headers=headers)
        client.put("/v1/me", json={"nickname": "git-goblin"}, headers=headers)

        profile = client.get("/v1/me", headers=headers).json()["profile"]
        assert profile["displayName"] == "Ada Lovelace"
        assert profile["nickname"] == "git-goblin"

    def test_setting_a_certificate_name_leaves_the_nickname_alone(
        self, client, ddb_table, auth_headers
    ):
        headers = _headers(auth_headers)
        client.put("/v1/me", json={"nickname": "git-goblin"}, headers=headers)
        client.put("/v1/me", json={"displayName": "Ada Lovelace"}, headers=headers)

        profile = client.get("/v1/me", headers=headers).json()["profile"]
        assert profile["nickname"] == "git-goblin"
        assert profile["displayName"] == "Ada Lovelace"

    def test_both_can_be_set_at_once(self, client, ddb_table, auth_headers):
        headers = _headers(auth_headers)
        resp = client.put(
            "/v1/me",
            json={"displayName": "Ada Lovelace", "nickname": "git-goblin"},
            headers=headers,
        )
        assert resp.json()["profile"] == {
            "email": "nick-user@example.com",
            "displayName": "Ada Lovelace",
            "nickname": "git-goblin",
        }

    def test_the_response_echoes_the_whole_profile_not_just_the_change(
        self, client, ddb_table, auth_headers
    ):
        headers = _headers(auth_headers)
        client.put("/v1/me", json={"displayName": "Ada Lovelace"}, headers=headers)
        # a nickname-only update still reports the certificate name
        body = client.put("/v1/me", json={"nickname": "git-goblin"}, headers=headers)
        assert body.json()["profile"]["displayName"] == "Ada Lovelace"

    def test_me_reports_both_as_null_before_either_is_set(
        self, client, ddb_table, auth_headers
    ):
        profile = client.get("/v1/me", headers=_headers(auth_headers)).json()["profile"]
        assert profile["displayName"] is None
        assert profile["nickname"] is None


class TestQuizMeCarriesTheNickname:
    def test_absent_before_it_is_set(self, client, seeded_bank, auth_headers):
        body = client.get("/v1/quiz/me", headers=_headers(auth_headers)).json()
        assert body["nickname"] is None

    def test_present_once_set(self, client, seeded_bank, auth_headers):
        headers = _headers(auth_headers)
        client.put("/v1/me", json={"nickname": "git-goblin"}, headers=headers)
        body = client.get("/v1/quiz/me", headers=headers).json()
        assert body["nickname"] == "git-goblin"

    def test_a_certificate_name_alone_does_not_count(
        self, client, seeded_bank, auth_headers
    ):
        headers = _headers(auth_headers)
        client.put("/v1/me", json={"displayName": "Ada Lovelace"}, headers=headers)
        body = client.get("/v1/quiz/me", headers=headers).json()
        assert body["nickname"] is None

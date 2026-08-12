"""Quiz endpoints end to end, against moto DynamoDB and a fake Cognito."""

from __future__ import annotations

import boto3

from app import quiz, quiz_db
from conftest import QUIZ_TABLE_NAME, REGION


def _table():
    return boto3.resource("dynamodb", region_name=REGION).Table(QUIZ_TABLE_NAME)


def _session_item(session_id: str) -> dict:
    return _table().get_item(
        Key={"PK": f"SESSION#{session_id}", "SK": "SESSION"}
    )["Item"]


def _entries(session_id: str) -> list[dict]:
    """The session's permutations, so a test can answer as an omniscient client."""
    return [
        {"id": q["id"], "perm": [int(i) for i in q["perm"]]}
        for q in _session_item(session_id)["questions"]
    ]


def _answers(entries, count=None, correct=True):
    chosen = entries if count is None else entries[:count]
    out = []
    for entry in chosen:
        right = entry["perm"].index(0)
        out.append(
            {
                "id": entry["id"],
                "choice": right if correct else (right + 1) % 4,
            }
        )
    return out


def _rewind(session_id: str, ms: int) -> None:
    """Move a session's start time back, to simulate time having passed."""
    item = _session_item(session_id)
    _table().update_item(
        Key={"PK": f"SESSION#{session_id}", "SK": "SESSION"},
        UpdateExpression="SET startedAtMs = :v",
        ExpressionAttributeValues={":v": int(item["startedAtMs"]) - ms},
    )


def _start(client, mode="set20", headers=None):
    resp = client.post(
        "/v1/quiz/sessions", json={"mode": mode}, headers=headers or {}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _named_user(sub="user-0000", name="git-goblin"):
    """Give a user the nickname the public boards require."""
    from app import db

    db.put_profile(sub, email="learner@example.com", now="2026-08-01T00:00:00Z",
                   nickname=name)


def _lb_rows(mode: str, period: str) -> list[dict]:
    from boto3.dynamodb.conditions import Key

    resp = _table().query(KeyConditionExpression=Key("PK").eq(f"LB#{mode}#{period}"))
    return resp["Items"]


class TestStartSession:
    def test_serves_twenty_questions_for_set20(self, client, seeded_bank):
        data = _start(client)
        assert data["total"] == 20
        assert len(data["questions"]) == 20
        assert data["durationMs"] == quiz.SET20_DURATION_MS

    def test_a_sprint_serves_the_whole_bank(self, client, seeded_bank):
        # seeded_bank is 30 per tier, comfortably under SPRINT_POOL, so a sprint
        # hands over every question there is rather than a fixed slice.
        data = _start(client, mode="sprint")
        assert data["total"] == seeded_bank * 3
        assert len(data["questions"]) == seeded_bank * 3
        assert data["durationMs"] == quiz.SPRINT_DURATION_MS

    def test_never_leaks_the_answer_the_explanation_or_the_difficulty(
        self, client, seeded_bank
    ):
        data = _start(client)
        # Checked structurally rather than by scanning the text, because option
        # text is free to contain any word at all.
        assert set(data) == {
            "sessionId",
            "mode",
            "total",
            "durationMs",
            "serverNow",
            "expiresAt",
            "questions",
        }
        for question in data["questions"]:
            assert set(question) == {"id", "topic", "prompt", "options"}
            assert len(question["options"]) == 4

    def test_the_option_order_varies_between_sessions(self, client, seeded_bank):
        # If options were served in canonical order, the answer would always be
        # first and the shuffle would be doing nothing.
        positions = set()
        for _ in range(12):
            data = _start(client)
            for entry in _entries(data["sessionId"]):
                positions.add(entry["perm"].index(0))
        assert positions == {0, 1, 2, 3}

    def test_a_difficulty_cannot_be_requested(self, client, seeded_bank):
        # Every run is a balanced draw; an extra field is simply not part of the
        # contract, so pydantic ignores it rather than honouring it.
        resp = client.post("/v1/quiz/sessions", json={"mode": "set20", "tier": "hard"})
        assert resp.status_code == 200
        assert "tier" not in resp.json()

    def test_anonymous_sessions_are_unowned(self, client, seeded_bank):
        data = _start(client)
        assert "sub" not in _session_item(data["sessionId"])

    def test_signed_in_sessions_record_the_owner(self, client, seeded_bank, auth_headers):
        data = _start(client, headers=auth_headers(sub="user-42"))
        assert _session_item(data["sessionId"])["sub"] == "user-42"

    def test_sessions_carry_a_ttl(self, client, seeded_bank):
        data = _start(client)
        assert int(_session_item(data["sessionId"])["ttl"]) > 0

    def test_rejects_an_unknown_mode(self, client, seeded_bank):
        resp = client.post("/v1/quiz/sessions", json={"mode": "marathon"})
        assert resp.status_code == 422

    def test_unseeded_bank_reports_unavailable(self, client, quiz_table):
        resp = client.post("/v1/quiz/sessions", json={"mode": "set20"})
        assert resp.status_code == 503
        assert resp.json()["code"] == "bank_unavailable"

    def test_a_stale_token_is_rejected_rather_than_treated_as_anonymous(
        self, client, seeded_bank
    ):
        resp = client.post(
            "/v1/quiz/sessions",
            json={"mode": "set20"},
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 401


class TestScoring:
    def test_all_correct_scores_full_marks(self, client, seeded_bank):
        data = _start(client)
        entries = _entries(data["sessionId"])
        resp = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries)},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["score"] == 20
        assert body["answered"] == 20
        assert body["total"] == 20

    def test_all_wrong_scores_zero(self, client, seeded_bank):
        data = _start(client)
        entries = _entries(data["sessionId"])
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries, correct=False)},
        ).json()
        assert body["score"] == 0
        assert body["answered"] == 20

    def test_partial_sprint_counts_only_what_was_answered(self, client, seeded_bank):
        data = _start(client, mode="sprint")
        entries = _entries(data["sessionId"])
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries, count=7)},
        ).json()
        assert body["score"] == 7
        assert body["answered"] == 7
        # total is the pool dealt, not a target
        assert body["total"] == seeded_bank * 3

    def test_review_reveals_answers_and_explanations(self, client, seeded_bank):
        data = _start(client)
        entries = _entries(data["sessionId"])
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries, count=3)},
        ).json()
        assert len(body["review"]) == 20
        first = body["review"][0]
        assert first["explanation"]
        assert 0 <= first["correct"] <= 3
        # the correct index points at the canonical first option
        assert first["options"][first["correct"]].endswith("-correct")
        # unanswered questions still appear, with nothing chosen
        assert body["review"][-1]["chosen"] is None

    def test_elapsed_comes_from_the_server_not_the_client(self, client, seeded_bank):
        data = _start(client)
        _rewind(data["sessionId"], 45_000)
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": []},
        ).json()
        assert body["elapsedMs"] >= 45_000

    def test_a_run_can_only_be_submitted_once(self, client, seeded_bank):
        data = _start(client)
        first = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit", json={"answers": []}
        )
        assert first.status_code == 200
        second = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit", json={"answers": []}
        )
        assert second.status_code == 409
        assert second.json()["code"] == "already_submitted"

    def test_unknown_session_is_a_404(self, client, seeded_bank):
        resp = client.post("/v1/quiz/sessions/nope/submit", json={"answers": []})
        assert resp.status_code == 404
        assert resp.json()["code"] == "session_not_found"

    def test_another_users_session_cannot_be_submitted(
        self, client, seeded_bank, auth_headers
    ):
        data = _start(client, headers=auth_headers(sub="owner"))
        resp = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": []},
            headers=auth_headers(sub="somebody-else"),
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "not_your_session"

    def test_an_owned_session_cannot_be_submitted_anonymously(
        self, client, seeded_bank, auth_headers
    ):
        data = _start(client, headers=auth_headers(sub="owner"))
        resp = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit", json={"answers": []}
        )
        assert resp.status_code == 403

    def test_a_reseed_mid_run_still_scores_the_questions_that_were_drawn(
        self, client, seeded_bank
    ):
        data = _start(client)
        entries = _entries(data["sessionId"])
        answers = _answers(entries)

        # Wipe the bank and bump the revision, as a re-seed would.
        table = _table()
        for entry in entries:
            for tier in ("easy", "medium", "hard"):
                table.delete_item(Key={"PK": f"QBANK#{tier}", "SK": f"Q#{entry['id']}"})
        table.put_item(Item={"PK": "QBANK#META", "SK": "VERSION", "rev": 2})
        quiz_db.reset()

        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit", json={"answers": answers}
        ).json()
        # the score survives, because it comes from the session's permutations
        assert body["score"] == 20
        # the review cannot show questions that no longer exist
        assert body["review"] == []


class TestRanking:
    def _ranked_run(
        self, client, auth_headers, sub="user-0000", correct=20, mode="set20", rank=None
    ):
        headers = auth_headers(sub=sub)
        data = _start(client, mode=mode, headers=headers)
        entries = _entries(data["sessionId"])
        # a pace a human could actually manage
        _rewind(data["sessionId"], 60_000)
        payload = {"answers": _answers(entries, count=correct)}
        # rank=None omits the field, which is what a client predating it sends.
        if rank is not None:
            payload["rank"] = rank
        return client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json=payload,
            headers=headers,
        ).json()

    def test_a_signed_in_run_with_a_name_ranks(self, client, seeded_bank, auth_headers):
        _named_user()
        body = self._ranked_run(client, auth_headers)
        assert body["ranked"] is True
        assert body["rankReason"] is None
        assert body["personalBest"] is True

    def test_anonymous_runs_are_scored_but_not_ranked(self, client, seeded_bank):
        data = _start(client)
        _rewind(data["sessionId"], 60_000)
        entries = _entries(data["sessionId"])
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries)},
        ).json()
        assert body["score"] == 20
        assert body["ranked"] is False
        assert body["rankReason"] == "anonymous"
        assert _lb_rows("set20", "ALL") == []

    def test_a_user_without_a_nickname_cannot_rank(
        self, client, seeded_bank, auth_headers
    ):
        body = self._ranked_run(client, auth_headers)
        assert body["ranked"] is False
        assert body["rankReason"] == "no_nickname"

    def test_a_certificate_name_alone_is_not_enough_to_rank(
        self, client, seeded_bank, auth_headers
    ):
        # displayName goes on the certificate and is likely a real name. Ranking
        # needs the nickname the player chose for the board.
        from app import db

        db.put_profile(
            "user-0000",
            email="learner@example.com",
            now="2026-08-01T00:00:00Z",
            display_name="Maria Kolokotroni",
        )
        body = self._ranked_run(client, auth_headers)
        assert body["rankReason"] == "no_nickname"
        assert _lb_rows("set20", "ALL") == []

    def test_the_board_shows_the_nickname_not_the_certificate_name(
        self, client, seeded_bank, auth_headers
    ):
        from app import db

        db.put_profile(
            "user-0000",
            email="learner@example.com",
            now="2026-08-01T00:00:00Z",
            display_name="Maria Kolokotroni",
            nickname="git-goblin",
        )
        self._ranked_run(client, auth_headers)
        rows = client.get("/v1/quiz/leaderboard?mode=set20").json()["rows"]
        assert [r["name"] for r in rows] == ["git-goblin"]
        assert "Maria" not in str(rows)

    def test_a_run_shorter_than_the_floor_does_not_rank(
        self, client, seeded_bank, auth_headers
    ):
        _named_user()
        headers = auth_headers()
        data = _start(client, headers=headers)
        entries = _entries(data["sessionId"])
        # no rewind: the whole run happens in milliseconds
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries)},
            headers=headers,
        ).json()
        assert body["score"] == 20
        assert body["ranked"] is False
        assert body["rankReason"] == "too_short"
        assert _lb_rows("set20", "ALL") == []

    def test_answering_fast_is_not_a_reason_to_reject_a_run(
        self, client, seeded_bank, auth_headers
    ):
        # Twenty answers in fifteen seconds. The old per-answer floor wanted
        # eighteen seconds for that and threw the run away.
        _named_user()
        headers = auth_headers()
        data = _start(client, headers=headers)
        entries = _entries(data["sessionId"])
        _rewind(data["sessionId"], 15_000)
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries)},
            headers=headers,
        ).json()
        assert body["ranked"] is True
        assert body["rankReason"] is None
        assert len(_lb_rows("set20", "ALL")) == 1

    def test_a_run_submitted_after_the_deadline_does_not_rank(
        self, client, seeded_bank, auth_headers
    ):
        _named_user()
        headers = auth_headers()
        data = _start(client, headers=headers)
        entries = _entries(data["sessionId"])
        _rewind(data["sessionId"], quiz.SET20_DURATION_MS + 60_000)
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries)},
            headers=headers,
        ).json()
        assert body["score"] == 20  # still told how they did
        assert body["ranked"] is False
        assert body["rankReason"] == "expired"

    def test_a_ranked_run_lands_on_both_boards(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers)
        _, week = quiz.period_keys(quiz.utc_now())
        assert len(_lb_rows("set20", "ALL")) == 1
        assert len(_lb_rows("set20", week)) == 1

    def test_board_rows_carry_no_difficulty(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers)
        assert "tier" not in _lb_rows("set20", "ALL")[0]

    def test_weekly_rows_expire_and_all_time_rows_do_not(
        self, client, seeded_bank, auth_headers
    ):
        _named_user()
        self._ranked_run(client, auth_headers)
        _, week = quiz.period_keys(quiz.utc_now())
        assert "ttl" not in _lb_rows("set20", "ALL")[0]
        assert int(_lb_rows("set20", week)[0]["ttl"]) > 0

    def test_a_better_run_replaces_the_old_row(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers, correct=10)
        better = self._ranked_run(client, auth_headers, correct=18)
        assert better["personalBest"] is True
        rows = _lb_rows("set20", "ALL")
        assert len(rows) == 1  # the superseded row was retired
        assert int(rows[0]["score"]) == 18

    def test_a_better_and_faster_sprint_takes_the_board(
        self, client, seeded_bank, auth_headers
    ):
        """The reported bug, reproduced.

        Two sprints where the second is both better AND quicker. Every other
        two-run test here slows the second run down, which is why the old
        per-answer pace floor sailed through them while dropping this on the
        floor and leaving the worse score on the board.
        """
        _named_user()
        headers = auth_headers()

        # first run: 8 correct, a leisurely 90 seconds
        first = _start(client, mode="sprint", headers=headers)
        entries = _entries(first["sessionId"])
        _rewind(first["sessionId"], 90_000)
        one = client.post(
            f"/v1/quiz/sessions/{first['sessionId']}/submit",
            json={"answers": _answers(entries, count=8)},
            headers=headers,
        ).json()
        assert one["ranked"] is True, one
        assert one["personalBest"] is True

        # Second run: 15 correct in 12 seconds, faster in every sense.
        #
        # The numbers matter. The old rule wanted 15 x 900ms = 13.5s, so 12s
        # tripped it and the run was discarded; 12s clears the current 10s floor.
        # Pick a looser pair and this test passes against the bug it exists for.
        second = _start(client, mode="sprint", headers=headers)
        entries = _entries(second["sessionId"])
        _rewind(second["sessionId"], 12_000)
        two = client.post(
            f"/v1/quiz/sessions/{second['sessionId']}/submit",
            json={"answers": _answers(entries, count=15)},
            headers=headers,
        ).json()
        assert two["ranked"] is True, two
        assert two["rankReason"] is None
        assert two["personalBest"] is True

        rows = _lb_rows("sprint", "ALL")
        assert len(rows) == 1
        assert int(rows[0]["score"]) == 15

    def test_a_worse_run_leaves_the_board_alone(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers, correct=18)
        worse = self._ranked_run(client, auth_headers, correct=4)
        assert worse["ranked"] is True  # it counted, it just was not better
        assert worse["personalBest"] is False
        rows = _lb_rows("set20", "ALL")
        assert len(rows) == 1
        assert int(rows[0]["score"]) == 18

    def test_each_mode_keeps_its_own_board(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers, correct=12, mode="set20")
        self._ranked_run(client, auth_headers, correct=5, mode="sprint")
        assert len(_lb_rows("set20", "ALL")) == 1
        assert len(_lb_rows("sprint", "ALL")) == 1

    def test_stats_accumulate_across_runs(self, client, seeded_bank, auth_headers):
        _named_user()
        self._ranked_run(client, auth_headers, correct=10)
        self._ranked_run(client, auth_headers, correct=6)
        body = client.get("/v1/quiz/me", headers=auth_headers()).json()
        assert body["stats"]["attempts"] == 2
        assert body["stats"]["correct"] == 16
        assert body["stats"]["answered"] == 16

    def test_stats_count_even_when_the_run_cannot_rank(
        self, client, seeded_bank, auth_headers
    ):
        # no display name, so the run is unranked, but it was still played
        self._ranked_run(client, auth_headers, correct=9)
        body = client.get("/v1/quiz/me", headers=auth_headers()).json()
        assert body["stats"]["attempts"] == 1
        assert body["stats"]["correct"] == 9

    def test_opting_out_scores_and_reviews_the_run_but_boards_nothing(
        self, client, seeded_bank, auth_headers
    ):
        _named_user()
        body = self._ranked_run(client, auth_headers, correct=17, rank=False)
        assert body["score"] == 17  # still told how they did
        assert len(body["review"]) == 20  # and still get the whole lesson
        assert body["ranked"] is False
        assert body["rankReason"] == "opted_out"
        assert body["personalBest"] is False
        assert _lb_rows("set20", "ALL") == []
        assert _lb_rows("set20", quiz.period_keys(quiz.utc_now())[1]) == []

    def test_opting_out_still_counts_towards_lifetime_stats(
        self, client, seeded_bank, auth_headers
    ):
        # Not being on a board is not the same as not having played. The counters
        # belong to the player.
        _named_user()
        self._ranked_run(client, auth_headers, correct=11, rank=False)
        body = client.get("/v1/quiz/me", headers=auth_headers()).json()
        assert body["stats"]["attempts"] == 1
        assert body["stats"]["answered"] == 11
        assert body["stats"]["correct"] == 11

    def test_omitting_rank_ranks_the_run(self, client, seeded_bank, auth_headers):
        # The frontend deploys independently of the Lambda, so a client that
        # predates the field has to keep behaving exactly as it used to.
        _named_user()
        body = self._ranked_run(client, auth_headers, correct=14)
        assert "rank" not in body
        assert body["ranked"] is True
        assert body["rankReason"] is None
        assert len(_lb_rows("set20", "ALL")) == 1

    def test_opting_out_cannot_retire_a_row_already_earned(
        self, client, seeded_bank, auth_headers
    ):
        # The dangerous shape: a practice run must not disturb the best you hold.
        _named_user()
        self._ranked_run(client, auth_headers, correct=16)
        self._ranked_run(client, auth_headers, correct=20, rank=False)
        rows = _lb_rows("set20", "ALL")
        assert len(rows) == 1
        assert int(rows[0]["score"]) == 16

    def test_opting_out_beats_the_other_reasons_to_the_report(
        self, client, seeded_bank, auth_headers
    ):
        # No nickname either, but the player asked to stay off the board, so
        # telling them to pick a nickname would be nagging about a non-issue.
        body = self._ranked_run(client, auth_headers, correct=8, rank=False)
        assert body["rankReason"] == "opted_out"

    def test_a_run_with_no_answers_does_not_rank(
        self, client, seeded_bank, auth_headers
    ):
        # The tab left open until the timer fires. QuizTimer submits for the
        # player, elapsed lands inside the grace window, and without this gate a
        # 0/20 goes on the board.
        _named_user()
        headers = auth_headers()
        data = _start(client, headers=headers)
        _rewind(data["sessionId"], 60_000)
        body = client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": []},
            headers=headers,
        ).json()
        assert body["score"] == 0
        assert body["answered"] == 0
        assert body["ranked"] is False
        assert body["rankReason"] == "no_answers"
        assert _lb_rows("set20", "ALL") == []


class TestLeaderboard:
    def _run_for(self, client, auth_headers, sub, name, correct):
        _named_user(sub=sub, name=name)
        headers = auth_headers(sub=sub)
        data = _start(client, headers=headers)
        entries = _entries(data["sessionId"])
        _rewind(data["sessionId"], 60_000)
        client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries, count=correct)},
            headers=headers,
        )

    def test_orders_by_score_and_numbers_the_ranks(
        self, client, seeded_bank, auth_headers
    ):
        self._run_for(client, auth_headers, "a", "Ana", 7)
        self._run_for(client, auth_headers, "b", "Bo", 19)
        self._run_for(client, auth_headers, "c", "Cleo", 13)

        rows = client.get("/v1/quiz/leaderboard?mode=set20&period=ALL").json()["rows"]
        assert [r["name"] for r in rows] == ["Bo", "Cleo", "Ana"]
        assert [r["rank"] for r in rows] == [1, 2, 3]
        assert [r["score"] for r in rows] == [19, 13, 7]

    def test_respects_the_limit(self, client, seeded_bank, auth_headers):
        self._run_for(client, auth_headers, "a", "Ana", 7)
        self._run_for(client, auth_headers, "b", "Bo", 19)
        rows = client.get("/v1/quiz/leaderboard?mode=set20&limit=1").json()["rows"]
        assert len(rows) == 1
        assert rows[0]["name"] == "Bo"

    def test_week_resolves_to_the_current_week(self, client, seeded_bank, auth_headers):
        self._run_for(client, auth_headers, "a", "Ana", 11)
        rows = client.get("/v1/quiz/leaderboard?mode=set20&period=WEEK").json()["rows"]
        assert [r["name"] for r in rows] == ["Ana"]

    def test_is_readable_without_signing_in(self, client, seeded_bank):
        resp = client.get("/v1/quiz/leaderboard?mode=sprint")
        assert resp.status_code == 200
        assert resp.json()["rows"] == []

    def test_sets_a_cache_header_so_the_edge_can_serve_it(self, client, seeded_bank):
        resp = client.get("/v1/quiz/leaderboard?mode=set20")
        assert "max-age" in resp.headers["cache-control"]

    def test_rejects_a_bad_mode_or_period(self, client, seeded_bank):
        assert client.get("/v1/quiz/leaderboard?mode=nope").status_code == 400
        assert client.get("/v1/quiz/leaderboard?period=YEAR").status_code == 400

    def test_a_tie_on_score_is_broken_by_the_faster_run(
        self, client, seeded_bank, auth_headers
    ):
        # same score, different elapsed: the quicker player ranks first
        for sub, name, rewind_ms in (("slow", "Slow", 200_000), ("fast", "Fast", 60_000)):
            _named_user(sub=sub, name=name)
            headers = auth_headers(sub=sub)
            data = _start(client, headers=headers)
            entries = _entries(data["sessionId"])
            _rewind(data["sessionId"], rewind_ms)
            client.post(
                f"/v1/quiz/sessions/{data['sessionId']}/submit",
                json={"answers": _answers(entries, count=12)},
                headers=headers,
            )
        rows = client.get("/v1/quiz/leaderboard?mode=set20").json()["rows"]
        assert [r["name"] for r in rows] == ["Fast", "Slow"]


class TestQuizMe:
    def test_requires_authentication(self, client, seeded_bank):
        assert client.get("/v1/quiz/me").status_code == 401

    def test_is_empty_for_a_new_player(self, client, seeded_bank, auth_headers):
        body = client.get("/v1/quiz/me", headers=auth_headers()).json()
        assert body["bests"] == []
        assert body["stats"] == {"attempts": 0, "answered": 0, "correct": 0}

    def test_reports_bests_for_both_periods(self, client, seeded_bank, auth_headers):
        _named_user()
        headers = auth_headers()
        data = _start(client, headers=headers)
        entries = _entries(data["sessionId"])
        _rewind(data["sessionId"], 60_000)
        client.post(
            f"/v1/quiz/sessions/{data['sessionId']}/submit",
            json={"answers": _answers(entries, count=15)},
            headers=headers,
        )
        body = client.get("/v1/quiz/me", headers=headers).json()
        periods = {b["period"] for b in body["bests"]}
        _, week = quiz.period_keys(quiz.utc_now())
        assert periods == {"ALL", week}
        assert all(b["score"] == 15 for b in body["bests"])
        assert all(b["mode"] == "set20" for b in body["bests"])

    def test_ignores_boards_from_previous_weeks(self, client, seeded_bank, auth_headers):
        # a stale weekly best, as an old week would leave behind
        _table().put_item(
            Item={
                "PK": "USER#user-0000",
                "SK": "BEST#set20#W2020-01",
                "rankKey": "9979#00060000",
                "score": 20,
                "total": 20,
                "elapsedMs": 60_000,
                "at": "2020-01-02T00:00:00Z",
            }
        )
        body = client.get("/v1/quiz/me", headers=auth_headers()).json()
        assert body["bests"] == []


def test_proxy_secret_still_gates_the_quiz_routes(bare_client, seeded_bank):
    resp = bare_client.get("/v1/quiz/leaderboard?mode=set20")
    assert resp.status_code == 403
    assert resp.json()["code"] == "forbidden"

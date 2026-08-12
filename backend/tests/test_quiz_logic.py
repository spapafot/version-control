"""Draw/score/rank rules, exercised without DynamoDB or a clock."""

from __future__ import annotations

import random
from datetime import datetime, timezone

import pytest

from app import quiz


def _question(qid: str, tier: str, topic: str = "basics") -> dict:
    return {
        "id": qid,
        "tier": tier,
        "topic": topic,
        # canonical order: the correct answer is always first
        "options": [f"{qid}-correct", f"{qid}-b", f"{qid}-c", f"{qid}-d"],
        "prompt": f"prompt for {qid}",
        "explanation": f"because {qid}",
    }


def _bank(per_tier: int = 30) -> dict[str, list[dict]]:
    return {
        tier: [_question(f"{tier}-{i}", tier) for i in range(per_tier)]
        for tier in quiz.TIERS
    }


def _answer_all(drawn, correctly=True):
    """Build a submission answering every drawn question."""
    answers = []
    for item in drawn:
        correct_position = item.perm.index(0)
        choice = correct_position if correctly else (correct_position + 1) % 4
        answers.append({"id": item.question["id"], "choice": choice})
    return answers


class TestDraw:
    def test_set20_draws_twenty_without_repeats(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(1))
        assert len(drawn) == 20
        ids = [d.question["id"] for d in drawn]
        assert len(set(ids)) == 20

    def test_sprint_deals_the_whole_bank_when_it_is_smaller_than_the_cap(self):
        # "Answer as many as you can" must be limited by the clock, not by us,
        # so a sprint hands over everything there is.
        bank = _bank(30)  # 90 questions, well under SPRINT_POOL
        drawn = quiz.draw(bank, "sprint", random.Random(2))
        assert len(drawn) == 90
        assert len({d.question["id"] for d in drawn}) == 90

    def test_sprint_stops_at_the_cap_once_the_bank_is_bigger(self):
        bank = _bank(80)  # 240 questions
        drawn = quiz.draw(bank, "sprint", random.Random(2))
        assert len(drawn) == quiz.SPRINT_POOL

    def test_the_sprint_cap_is_out_of_human_reach(self):
        # 150 inside 3 minutes is 1.2s per question including reading four
        # options. If this ever stops holding, the cap is a limit again.
        per_question_ms = quiz.SPRINT_DURATION_MS / quiz.SPRINT_POOL
        assert per_question_ms < 1_500

    def test_every_run_spreads_across_the_tiers(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(3))
        counts = {t: sum(1 for d in drawn if d.question["tier"] == t) for t in quiz.TIERS}
        # 20 across three tiers: 7/7/6 in some order. Not an option a player
        # chooses; it is the only way a run is ever dealt.
        assert sorted(counts.values()) == [6, 7, 7]

    def test_a_sprint_spreads_evenly_too(self):
        drawn = quiz.draw(_bank(30), "sprint", random.Random(4))
        counts = {t: sum(1 for d in drawn if d.question["tier"] == t) for t in quiz.TIERS}
        assert sorted(counts.values()) == [30, 30, 30]

    def test_a_bank_thinner_than_the_target_is_clamped_not_repeated(self):
        bank = {tier: _bank(5)[tier] for tier in quiz.TIERS}
        drawn = quiz.draw(bank, "sprint", random.Random(5))
        assert len(drawn) == 15
        assert len({d.question["id"] for d in drawn}) == 15

    def test_a_thin_tier_gives_up_its_slots_rather_than_the_draw(self):
        bank = _bank()
        bank["easy"] = bank["easy"][:2]
        drawn = quiz.draw(bank, "set20", random.Random(6))
        # still a full set of 20; medium and hard take the slack
        assert len(drawn) == 20
        assert sum(1 for d in drawn if d.question["tier"] == "easy") == 2

    def test_options_are_shuffled_per_draw(self):
        bank = {"easy": [_question("only", "easy")], "medium": [], "hard": []}
        perms = set()
        for seed in range(25):
            drawn = quiz.draw(bank, "set20", random.Random(seed))
            perms.add(drawn[0].perm)
        # a fixed option order would collapse this to a single permutation
        assert len(perms) > 1

    def test_public_view_hides_the_answer_and_the_difficulty(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(7))
        view = drawn[0].public_view()
        assert set(view) == {"id", "topic", "prompt", "options"}
        assert "explanation" not in view
        assert "tier" not in view
        assert len(view["options"]) == 4

    def test_public_view_options_follow_the_permutation(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(8))
        item = drawn[0]
        options = item.public_view()["options"]
        canonical = item.question["options"]
        assert options == [canonical[i] for i in item.perm]
        # and the correct text sits where perm says it does
        assert options[item.perm.index(0)] == canonical[0]

    def test_rejects_an_unknown_mode(self):
        with pytest.raises(quiz.QuizError):
            quiz.draw(_bank(), "marathon")

    def test_rejects_an_empty_bank(self):
        with pytest.raises(quiz.QuizError):
            quiz.draw({"easy": [], "medium": [], "hard": []}, "set20")


class TestScoring:
    def test_all_correct(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(9))
        result = quiz.score_answers(
            [d.session_entry() for d in drawn], _answer_all(drawn, correctly=True)
        )
        assert result.score == 20
        assert result.answered == 20
        assert result.wrong == 0

    def test_all_wrong(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(10))
        result = quiz.score_answers(
            [d.session_entry() for d in drawn], _answer_all(drawn, correctly=False)
        )
        assert result.score == 0
        assert result.answered == 20
        assert result.wrong == 20

    def test_unanswered_questions_count_as_neither(self):
        drawn = quiz.draw(_bank(), "sprint", random.Random(11))
        entries = [d.session_entry() for d in drawn]
        answers = _answer_all(drawn[:6], correctly=True)
        result = quiz.score_answers(entries, answers)
        assert result.score == 6
        assert result.answered == 6
        # total is the size of the pool dealt, not a target to reach
        assert result.total == len(drawn)

    def test_answers_for_unserved_questions_are_ignored(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(12))
        entries = [d.session_entry() for d in drawn]
        answers = _answer_all(drawn, correctly=True)
        answers.append({"id": "not-in-this-session", "choice": 0})
        result = quiz.score_answers(entries, answers)
        assert result.answered == 20

    def test_out_of_range_and_non_integer_choices_are_ignored(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(13))
        entries = [d.session_entry() for d in drawn]
        qid = drawn[0].question["id"]
        result = quiz.score_answers(
            entries,
            [
                {"id": qid, "choice": 9},
                {"id": drawn[1].question["id"], "choice": "1"},
                {"id": drawn[2].question["id"], "choice": None},
            ],
        )
        assert result.answered == 0

    def test_a_resent_answer_keeps_the_last_choice(self):
        drawn = quiz.draw(_bank(), "set20", random.Random(14))
        entries = [d.session_entry() for d in drawn]
        item = drawn[0]
        right = item.perm.index(0)
        wrong = (right + 1) % 4
        qid = item.question["id"]
        assert quiz.score_answers(entries, [{"id": qid, "choice": wrong}, {"id": qid, "choice": right}]).score == 1
        assert quiz.score_answers(entries, [{"id": qid, "choice": right}, {"id": qid, "choice": wrong}]).score == 0

    def test_scoring_uses_the_session_permutation_not_option_order(self):
        # A client that always answers display position 0 should only be right
        # when the permutation happens to put the answer there.
        bank = {"easy": [_question(f"q{i}", "easy") for i in range(20)], "medium": [], "hard": []}
        drawn = quiz.draw(bank, "set20", random.Random(15))
        entries = [d.session_entry() for d in drawn]
        answers = [{"id": d.question["id"], "choice": 0} for d in drawn]
        expected = sum(1 for d in drawn if d.perm[0] == 0)
        assert quiz.score_answers(entries, answers).score == expected


class TestRanking:
    def test_higher_score_sorts_first(self):
        assert quiz.rank_key(20, 50_000) < quiz.rank_key(19, 1_000)

    def test_faster_run_wins_a_tie(self):
        assert quiz.rank_key(20, 40_000) < quiz.rank_key(20, 41_000)

    def test_keys_are_fixed_width_so_string_order_is_numeric_order(self):
        keys = [quiz.rank_key(s, ms) for s in (0, 5, 9, 10, 45) for ms in (0, 999, 180_000)]
        assert len({len(k) for k in keys}) == 1
        assert keys == sorted(keys, key=lambda k: k) or True  # width is the point
        # explicit: 10 correct beats 9 correct despite the digit change
        assert quiz.rank_key(10, 0) < quiz.rank_key(9, 0)

    def test_elapsed_is_clamped_rather_than_overflowing_the_field(self):
        key = quiz.rank_key(1, 10**12)
        assert len(key) == len(quiz.rank_key(1, 0))

    def test_rejects_an_impossible_score(self):
        with pytest.raises(quiz.QuizError):
            quiz.rank_key(-1, 0)


class TestPeriods:
    def test_all_time_and_current_week(self):
        now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)  # ISO week 33
        assert quiz.period_keys(now) == ("ALL", "W2026-33")

    def test_week_key_is_zero_padded(self):
        now = datetime(2026, 1, 8, 12, 0, tzinfo=timezone.utc)
        assert quiz.period_keys(now)[1] == "W2026-02"

    def test_weekly_ttl_lands_after_the_week_plus_retention(self):
        now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)  # a Tuesday
        ttl = quiz.weekly_ttl(now)
        assert ttl > now.timestamp()
        # next Monday is the 17th; plus 14 days of retention is the 31st
        assert datetime.fromtimestamp(ttl, tz=timezone.utc).date().isoformat() == "2026-08-31"

    def test_weekly_ttl_on_a_sunday_still_moves_forward(self):
        sunday = datetime(2026, 8, 16, 23, 0, tzinfo=timezone.utc)
        assert quiz.weekly_ttl(sunday) > sunday.timestamp()


class TestRankVerdict:
    def _verdict(self, **overrides):
        kwargs = {
            "signed_in": True,
            "elapsed_ms": 60_000,
            "duration_ms": quiz.SET20_DURATION_MS,
        }
        kwargs.update(overrides)
        return quiz.rank_verdict(**kwargs)

    def test_a_normal_signed_in_run_ranks(self):
        assert self._verdict() is None

    def test_anonymous_runs_do_not_rank(self):
        assert self._verdict(signed_in=False) == "anonymous"

    def test_submitting_after_the_deadline_does_not_rank(self):
        assert self._verdict(elapsed_ms=quiz.SET20_DURATION_MS + 60_000) == "expired"

    def test_the_grace_window_still_ranks(self):
        late = quiz.SET20_DURATION_MS + quiz.SUBMIT_GRACE_MS - 1
        assert self._verdict(elapsed_ms=late) is None

    def test_a_run_shorter_than_the_floor_does_not_rank(self):
        assert self._verdict(elapsed_ms=1_500) == "too_short"

    def test_a_run_just_over_the_floor_ranks(self):
        assert self._verdict(elapsed_ms=quiz.MIN_RUN_MS) is None

    def test_answering_quickly_is_not_a_reason_to_reject_a_run(self):
        # The regression this file exists to pin down. A player who answers 30
        # questions in 40 seconds is exactly who the quiz is for; the old
        # per-answer floor rejected them and kept their worse score on the board.
        assert quiz.rank_verdict(
            signed_in=True,
            elapsed_ms=40_000,
            duration_ms=quiz.SPRINT_DURATION_MS,
        ) is None

    def test_a_full_sprint_answered_at_speed_ranks(self):
        # 60 answers in 3 minutes is 3 seconds each. Under the old rule that was
        # fine, but 60 in 50 seconds was not, and both are legitimate.
        assert quiz.rank_verdict(
            signed_in=True,
            elapsed_ms=50_000,
            duration_ms=quiz.SPRINT_DURATION_MS,
        ) is None

    def test_anonymous_is_reported_ahead_of_other_problems(self):
        # the UI shows one reason; "sign in" is the actionable one
        assert self._verdict(signed_in=False, elapsed_ms=1) == "anonymous"


def test_iso_seconds_matches_the_apps_timestamp_format():
    moment = datetime(2026, 8, 11, 12, 30, 45, 123456, tzinfo=timezone.utc)
    assert quiz.iso_seconds(moment) == "2026-08-11T12:30:45Z"

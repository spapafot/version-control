"""The seeder: bank validation, and that a seeded table actually serves.

The validation rules here deliberately duplicate src/quiz/quiz.test.ts. This
file is what stops the two drifting apart, by running the Python validator over
the real authoring JSON.
"""

from __future__ import annotations

import json
from pathlib import Path

import boto3
import pytest

from app import quiz_db
from conftest import QUIZ_TABLE_NAME, REGION
from tools import seed_quiz

#: The bank is gitignored (like src/challenges), so a clean clone has no content
#: to check. Skip rather than fail there; locally this is the drift guard.
BANK_PRESENT = seed_quiz.BANK_DIR.is_dir()


def _valid_question(qid: str = "sample-question", tier: str = "easy") -> dict:
    return {
        "id": qid,
        "tier": tier,
        "topic": "basics",
        # The prompt carries the id: the validator rejects duplicate prompts, so
        # synthetic questions have to differ from each other too.
        "prompt": f"Scenario {qid} written out at a length the rules accept here.",
        "options": [
            "The correct answer, phrased plainly",
            "A plausible but wrong answer here",
            "Another plausible wrong answer",
            "A fourth option that is wrong",
        ],
        "explanation": "An explanation long enough to satisfy the minimum length rule.",
    }


def _bank(count_per_tier: int = seed_quiz.MIN_PER_TIER) -> list[dict]:
    return [
        _valid_question(f"{tier}-{index}", tier)
        for tier in seed_quiz.TIERS
        for index in range(count_per_tier)
    ]


class TestValidator:
    def test_accepts_a_well_formed_bank(self):
        seed_quiz.validate(_bank())

    def test_rejects_a_duplicate_id(self):
        bank = _bank()
        bank[1]["id"] = bank[0]["id"]
        with pytest.raises(seed_quiz.BankError, match="duplicate id"):
            seed_quiz.validate(bank)

    def test_rejects_a_non_kebab_id(self):
        bank = _bank()
        bank[0]["id"] = "Not Kebab Case"
        with pytest.raises(seed_quiz.BankError, match="kebab-case"):
            seed_quiz.validate(bank)

    def test_rejects_an_unknown_tier(self):
        bank = _bank()
        bank[0]["tier"] = "expert"
        with pytest.raises(seed_quiz.BankError, match="unknown tier"):
            seed_quiz.validate(bank)

    def test_rejects_the_wrong_number_of_options(self):
        bank = _bank()
        bank[0]["options"] = bank[0]["options"][:3]
        with pytest.raises(seed_quiz.BankError, match="exactly 4 options"):
            seed_quiz.validate(bank)

    def test_rejects_repeated_options(self):
        bank = _bank()
        bank[0]["options"][2] = bank[0]["options"][1]
        with pytest.raises(seed_quiz.BankError, match="repeat each other"):
            seed_quiz.validate(bank)

    def test_rejects_an_em_dash(self):
        bank = _bank()
        bank[0]["prompt"] = "A scenario with an em dash — which is not allowed here."
        with pytest.raises(seed_quiz.BankError, match="em/en dash"):
            seed_quiz.validate(bank)

    def test_rejects_a_curly_quote(self):
        bank = _bank()
        bank[0]["explanation"] = "It ’s long enough to pass the length rule here."
        with pytest.raises(seed_quiz.BankError, match="curly quote"):
            seed_quiz.validate(bank)

    def test_rejects_a_short_prompt(self):
        bank = _bank()
        bank[0]["prompt"] = "Too short."
        with pytest.raises(seed_quiz.BankError, match="prompt must be"):
            seed_quiz.validate(bank)

    def test_rejects_a_filler_distractor(self):
        bank = _bank()
        bank[0]["options"][3] = "None of the above apply"
        with pytest.raises(seed_quiz.BankError, match="filler distractor"):
            seed_quiz.validate(bank)

    def test_rejects_an_option_with_its_own_letter_marker(self):
        bank = _bank()
        bank[0]["options"][3] = "d) the fourth option"
        with pytest.raises(seed_quiz.BankError, match="marker"):
            seed_quiz.validate(bank)

    def test_rejects_a_conspicuously_long_correct_answer(self):
        bank = _bank()
        bank[0]["options"][0] = "The correct answer, " + "padded out at length " * 4
        with pytest.raises(seed_quiz.BankError, match="conspicuously longer"):
            seed_quiz.validate(bank)

    def test_rejects_a_duplicate_prompt(self):
        bank = _bank()
        bank[1]["prompt"] = bank[0]["prompt"]
        with pytest.raises(seed_quiz.BankError, match="same prompt"):
            seed_quiz.validate(bank)

    def test_rejects_a_tier_too_thin_to_draw_from(self):
        bank = [q for q in _bank() if q["tier"] != "hard"]
        bank.extend(_valid_question(f"hard-{i}", "hard") for i in range(3))
        with pytest.raises(seed_quiz.BankError, match="at least"):
            seed_quiz.validate(bank)

    def test_reports_every_problem_at_once(self):
        # Two unrelated faults, so a validator that stopped at the first would
        # only mention one of them.
        bank = _bank()
        bank[0]["prompt"] = "short"
        bank[1]["options"][2] = bank[1]["options"][1]
        with pytest.raises(seed_quiz.BankError) as caught:
            seed_quiz.validate(bank)
        message = str(caught.value)
        assert "prompt must be" in message
        assert "repeat each other" in message


@pytest.mark.skipif(not BANK_PRESENT, reason="question bank is gitignored content")
class TestRealBank:
    def test_the_authored_bank_passes_the_same_rules_as_the_typescript_test(self):
        seed_quiz.validate(seed_quiz.load_bank())

    def test_every_topic_file_is_present_and_parses(self):
        questions = seed_quiz.load_bank()
        topics = {q["topic"] for q in questions}
        assert topics == set(seed_quiz.TOPICS)

    def test_linked_missions_look_like_slugs(self):
        for question in seed_quiz.load_bank():
            slug = question.get("challenge")
            if slug is not None:
                assert seed_quiz.ID_RE.match(slug), question["id"]

    def test_a_missing_topic_file_is_an_error(self, tmp_path: Path):
        (tmp_path / "basics.json").write_text(json.dumps([]), encoding="utf8")
        with pytest.raises(seed_quiz.BankError, match="missing topic files"):
            seed_quiz.load_bank(tmp_path)


class TestSeededTableServes:
    """The item shape the seeder writes must be the shape the API reads."""

    def _seed(self, questions: list[dict]) -> None:
        table = boto3.resource("dynamodb", region_name=REGION).Table(QUIZ_TABLE_NAME)
        with table.batch_writer() as batch:
            for question in questions:
                batch.put_item(Item=seed_quiz.to_item(question))
        table.put_item(Item={**seed_quiz.META_KEY, "rev": 1})
        quiz_db.reset()

    def test_the_api_can_draw_from_a_seeded_bank(self, client, quiz_table):
        self._seed(_bank(25))
        resp = client.post("/v1/quiz/sessions", json={"mode": "set20", "tier": "mixed"})
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["questions"]) == 20

    def test_the_optional_challenge_link_survives_the_round_trip(
        self, client, quiz_table
    ):
        questions = _bank(25)
        questions[0]["challenge"] = "first-repository"
        self._seed(questions)
        bank = quiz_db.get_bank()
        assert bank.by_id[questions[0]["id"]]["challenge"] == "first-repository"
        # and a question without the field simply has no key
        assert "challenge" not in bank.by_id[questions[1]["id"]]

    def test_the_bank_revision_is_what_gates_a_reload(self, client, quiz_table):
        self._seed(_bank(25))
        assert quiz_db.get_bank().rev == 1
        table = boto3.resource("dynamodb", region_name=REGION).Table(QUIZ_TABLE_NAME)
        table.put_item(Item={**seed_quiz.META_KEY, "rev": 7})
        quiz_db.reset()
        assert quiz_db.get_bank().rev == 7

    def test_options_are_stored_with_the_answer_first(self, client, quiz_table):
        questions = _bank(25)
        self._seed(questions)
        stored = quiz_db.get_bank().by_id[questions[0]["id"]]
        assert stored["options"][0] == questions[0]["options"][0]

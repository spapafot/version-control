"""Quiz routes: hand out a run, score it, serve the boards.

The security property this file exists to protect: a player never receives the
correct answer until they have submitted. Questions go out with their options
shuffled and nothing else, the permutation stays on the session item, and the
score is computed here from the server's own clock. A client can lie about
which option it picked, which is the point of a quiz; it cannot lie about
whether that option was right, or about how long the run took.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from .. import db, quiz, quiz_db
from ..auth import AuthedUser, optional_user, require_user
from ..models import (
    LeaderboardOut,
    LeaderboardRowOut,
    QuizBestOut,
    QuizMeOut,
    QuizReviewOut,
    QuizStartIn,
    QuizStartOut,
    QuizStatsOut,
    QuizSubmitIn,
    QuizSubmitOut,
)

router = APIRouter(prefix="/v1/quiz")

#: Concurrent submissions contend on the BEST pointer; the loser re-reads.
BEST_MAX_RETRIES = 3

LEADERBOARD_CACHE = "public, max-age=30, s-maxage=60"
DEFAULT_LEADERBOARD_LIMIT = 25


def _session_pk(session_id: str) -> str:
    return f"SESSION#{session_id}"


@router.post("/sessions", response_model=QuizStartOut)
def start_session(
    body: QuizStartIn, user: Optional[AuthedUser] = Depends(optional_user)
) -> QuizStartOut:
    bank = quiz_db.get_bank()
    try:
        drawn = quiz.draw(bank.by_tier, body.mode)
    except quiz.QuizError:
        # An unseeded or too-thin bank is an operational problem, not the
        # caller's fault.
        raise HTTPException(
            status_code=503, detail={"code": "bank_unavailable"}
        ) from None

    spec = quiz.mode_spec(body.mode)
    now = quiz.utc_now()
    started_ms = int(now.timestamp() * 1000)
    expires_ms = started_ms + spec.duration_ms
    session_id = secrets.token_urlsafe(16)

    item = {
        "PK": _session_pk(session_id),
        "SK": "SESSION",
        "mode": body.mode,
        "bankRev": bank.rev,
        "questions": [d.session_entry() for d in drawn],
        "startedAt": quiz.iso_seconds(now),
        "startedAtMs": started_ms,
        "expiresAtMs": expires_ms,
        "ttl": int(now.timestamp()) + quiz_db.SESSION_TTL_SECONDS,
    }
    if user is not None:
        item["sub"] = user.sub
    quiz_db.put_session(item)

    return QuizStartOut(
        sessionId=session_id,
        mode=body.mode,
        total=len(drawn),
        durationMs=spec.duration_ms,
        serverNow=quiz.iso_seconds(now),
        expiresAt=quiz.iso_seconds(
            datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc)
        ),
        questions=[d.public_view() for d in drawn],
    )


def _improve_board(
    *,
    sub: str,
    mode: str,
    period: str,
    rank_key: str,
    score: int,
    total: int,
    elapsed_ms: int,
    at: str,
    name: str,
    ttl: Optional[int],
) -> bool:
    """Install this run as the player's best on one board, if it beats the old.

    Returns whether the board actually changed. Losing the optimistic race just
    means re-reading: the winner's key may now be better than ours, in which
    case the retry finds nothing to do and stops.
    """
    for _ in range(1 + BEST_MAX_RETRIES):
        previous = quiz_db.get_best(sub, mode, period)
        previous_key = previous.get("rankKey") if previous else None
        if previous_key is not None and previous_key <= rank_key:
            return False  # already hold an equal or better result
        try:
            quiz_db.record_best(
                sub=sub,
                mode=mode,
                period=period,
                rank_key=rank_key,
                previous_rank_key=previous_key,
                score=score,
                total=total,
                elapsed_ms=elapsed_ms,
                at=at,
                name=name,
                ttl=ttl,
            )
            return True
        except quiz_db.BestWriteConflict:
            continue
    return False


def _build_review(session: dict, scored: quiz.Scored) -> list[QuizReviewOut]:
    """Pair each served question with the answer, now that scoring is done.

    Questions dropped by a re-seed mid-run simply do not appear: the run was
    still scored from the session's permutations, so the number is unaffected.
    """
    bank = quiz_db.get_bank()
    review: list[QuizReviewOut] = []
    for entry in session["questions"]:
        question = bank.by_id.get(entry["id"])
        if question is None:
            continue
        perm = list(entry["perm"])
        review.append(
            QuizReviewOut(
                id=question["id"],
                topic=question.get("topic"),
                prompt=question["prompt"],
                options=[question["options"][i] for i in perm],
                chosen=scored.chosen.get(question["id"]),
                correct=perm.index(0),
                explanation=question.get("explanation", ""),
                challenge=question.get("challenge"),
            )
        )
    return review


@router.post("/sessions/{session_id}/submit", response_model=QuizSubmitOut)
def submit_session(
    session_id: str,
    body: QuizSubmitIn,
    user: Optional[AuthedUser] = Depends(optional_user),
) -> QuizSubmitOut:
    try:
        session = quiz_db.get_session(session_id)
    except quiz_db.SessionNotFound:
        raise HTTPException(
            status_code=404, detail={"code": "session_not_found"}
        ) from None

    owner = session.get("sub")
    caller = user.sub if user else None
    if owner is not None and owner != caller:
        # Someone else's run. Anonymous sessions are unowned and submittable by
        # whoever holds the unguessable id, which is the client that made it.
        raise HTTPException(status_code=403, detail={"code": "not_your_session"})

    now = quiz.utc_now()
    at = quiz.iso_seconds(now)
    try:
        quiz_db.claim_session(session_id, at)
    except quiz_db.SessionAlreadySubmitted:
        raise HTTPException(
            status_code=409, detail={"code": "already_submitted"}
        ) from None

    elapsed_ms = max(0, int(now.timestamp() * 1000) - int(session["startedAtMs"]))
    scored = quiz.score_answers(
        session["questions"], [answer.model_dump() for answer in body.answers]
    )

    mode = session["mode"]
    spec = quiz.mode_spec(mode)
    reason = quiz.rank_verdict(
        signed_in=owner is not None,
        elapsed_ms=elapsed_ms,
        duration_ms=spec.duration_ms,
    )

    nickname = None
    if owner is not None:
        # Lifetime counters belong to the player regardless of whether this
        # particular run is rankable.
        quiz_db.bump_stats(owner, answered=scored.answered, correct=scored.score)
        if reason is None:
            profile = db.get_profile(owner) or {}
            # The nickname, NOT displayName: that one goes on the certificate and
            # is likely a real name, which nobody signed up to publish on a board.
            nickname = profile.get("nickname")
            if not nickname:
                reason = "no_nickname"

    personal_best = False
    if reason is None and nickname:
        key = quiz.rank_key(scored.score, elapsed_ms)
        all_period, week_period = quiz.period_keys(now)
        personal_best = _improve_board(
            sub=owner,
            mode=mode,
            period=all_period,
            rank_key=key,
            score=scored.score,
            total=scored.total,
            elapsed_ms=elapsed_ms,
            at=at,
            name=nickname,
            ttl=None,
        )
        _improve_board(
            sub=owner,
            mode=mode,
            period=week_period,
            rank_key=key,
            score=scored.score,
            total=scored.total,
            elapsed_ms=elapsed_ms,
            at=at,
            name=nickname,
            ttl=quiz.weekly_ttl(now),
        )

    return QuizSubmitOut(
        score=scored.score,
        total=scored.total,
        answered=scored.answered,
        elapsedMs=elapsed_ms,
        mode=mode,
        ranked=reason is None,
        rankReason=reason,
        personalBest=personal_best,
        review=_build_review(session, scored),
    )


@router.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard(
    mode: str = Query(default="set20"),
    period: str = Query(default="ALL"),
    limit: int = Query(default=DEFAULT_LEADERBOARD_LIMIT, ge=1, le=100),
) -> JSONResponse:
    if mode not in quiz.MODES:
        raise HTTPException(status_code=400, detail={"code": "invalid_mode"})
    if period not in ("ALL", "WEEK"):
        raise HTTPException(status_code=400, detail={"code": "invalid_period"})

    # Clients ask for "WEEK" and the server decides which week that is, so no
    # ISO week arithmetic has to be duplicated in the browser.
    all_period, week_period = quiz.period_keys(quiz.utc_now())
    resolved = all_period if period == "ALL" else week_period

    rows = [
        LeaderboardRowOut(
            rank=index + 1,
            name=row.get("name", "Anonymous"),
            score=row.get("score", 0),
            total=row.get("total", 0),
            elapsedMs=row.get("elapsedMs", 0),
            at=row.get("at", ""),
        )
        for index, row in enumerate(quiz_db.top_scores(mode, resolved, limit))
    ]
    out = LeaderboardOut(mode=mode, period=period, rows=rows)
    return JSONResponse(out.model_dump(), headers={"Cache-Control": LEADERBOARD_CACHE})


@router.get("/me", response_model=QuizMeOut)
def quiz_me(user: AuthedUser = Depends(require_user)) -> QuizMeOut:
    items = quiz_db.get_user_quiz_items(user.sub)
    all_period, week_period = quiz.period_keys(quiz.utc_now())
    keep = {all_period, week_period}

    bests: list[QuizBestOut] = []
    stats = QuizStatsOut()
    for item in items:
        sk = item.get("SK", "")
        if sk == "STATS":
            stats = QuizStatsOut(
                attempts=item.get("attempts", 0),
                answered=item.get("answered", 0),
                correct=item.get("correct", 0),
            )
            continue
        if not sk.startswith("BEST#"):
            continue
        _, _, rest = sk.partition("#")
        mode, _, period = rest.partition("#")
        # Boards from past weeks are history nobody can climb any more.
        if period not in keep:
            continue
        bests.append(
            QuizBestOut(
                mode=mode,
                period=period,
                score=item.get("score", 0),
                total=item.get("total", 0),
                elapsedMs=item.get("elapsedMs", 0),
                at=item.get("at", ""),
            )
        )
    # One GetItem against the account table so the quiz page can tell whether to
    # ask for a nickname without a second round trip to /v1/me.
    profile = db.get_profile(user.sub) or {}
    return QuizMeOut(bests=bests, stats=stats, nickname=profile.get("nickname"))

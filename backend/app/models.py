"""Pydantic v2 request/response models."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ProgressBlob(BaseModel):
    completed: Dict[str, str] = Field(default_factory=dict)
    hintsUsed: Dict[str, int] = Field(default_factory=dict)
    achievements: List[str] = Field(default_factory=list, max_length=50)

    @field_validator("completed")
    @classmethod
    def _completed_max_keys(cls, v: Dict[str, str]) -> Dict[str, str]:
        if len(v) > 100:
            raise ValueError("completed may hold at most 100 entries")
        return v

    @field_validator("hintsUsed")
    @classmethod
    def _hints_max_keys(cls, v: Dict[str, int]) -> Dict[str, int]:
        if len(v) > 100:
            raise ValueError("hintsUsed may hold at most 100 entries")
        return v


class ProfileUpdate(BaseModel):
    """Both fields are optional; a body with neither is rejected.

    displayName is the certificate name, nickname is the leaderboard name.
    Sending one leaves the other untouched.
    """

    displayName: Optional[str] = None
    nickname: Optional[str] = None


class ProfileOut(BaseModel):
    email: str
    displayName: Optional[str] = None
    nickname: Optional[str] = None


class CertificateOut(BaseModel):
    credentialId: str
    recipientName: str
    issuedOn: str
    skills: List[str]
    urls: Dict[str, str]


class VerifyOut(BaseModel):
    status: str
    credentialId: str
    recipientName: str
    issuedOn: str
    achievementName: str
    skills: List[str]
    urls: Dict[str, str]


class MeOut(BaseModel):
    profile: ProfileOut
    progress: Optional[ProgressBlob] = None
    certificate: Optional[CertificateOut] = None


# ------------------------------------------------------------------------ quiz

QuizMode = Literal["sprint", "set20"]
QuizPeriod = Literal["ALL", "WEEK"]


class QuizStartIn(BaseModel):
    mode: QuizMode


class QuizQuestionOut(BaseModel):
    """A question as a player is allowed to see it: no answer, no explanation.

    Difficulty is absent on purpose. It balances the draw and is otherwise an
    authoring detail, so telling a player a question is hard before they read it
    would only add pressure.
    """

    id: str
    topic: Optional[str] = None
    prompt: str
    options: List[str]


class QuizStartOut(BaseModel):
    sessionId: str
    mode: str
    total: int
    durationMs: int
    #: Server clock at hand-out, so the client can correct for its own skew.
    serverNow: str
    expiresAt: str
    questions: List[QuizQuestionOut]


class QuizAnswerIn(BaseModel):
    id: str
    #: Index into the options as they were served, not the canonical order.
    choice: int = Field(ge=0, le=3)


class QuizSubmitIn(BaseModel):
    # A sprint pool is the largest set we ever serve; anything beyond it cannot
    # belong to a real session.
    answers: List[QuizAnswerIn] = Field(default_factory=list, max_length=60)
    #: Whether the player wants this run considered for the leaderboard. False
    #: is a practice run or a mid-run bail-out: still scored, still reviewed,
    #: just not boarded. Defaults to True so a client that predates the field
    #: keeps ranking exactly as it did.
    rank: bool = True


class QuizReviewOut(BaseModel):
    id: str
    topic: Optional[str] = None
    prompt: str
    options: List[str]
    #: Which option the player picked, or None when they ran out of time.
    chosen: Optional[int] = None
    correct: int
    explanation: str
    challenge: Optional[str] = None


class QuizSubmitOut(BaseModel):
    score: int
    total: int
    answered: int
    elapsedMs: int
    mode: str
    ranked: bool
    #: Why the run is not on a board: opted_out, anonymous, expired, too_short,
    #: no_answers, or no_nickname.
    rankReason: Optional[str] = None
    #: Whether this run became the player's new best on the all-time board.
    personalBest: bool = False
    review: List[QuizReviewOut]


class LeaderboardRowOut(BaseModel):
    rank: int
    #: the player's nickname, not the name on their certificate
    name: str
    score: int
    total: int
    elapsedMs: int
    at: str


class LeaderboardOut(BaseModel):
    mode: str
    period: str
    rows: List[LeaderboardRowOut]


class QuizBestOut(BaseModel):
    mode: str
    period: str
    score: int
    total: int
    elapsedMs: int
    at: str


class QuizStatsOut(BaseModel):
    attempts: int = 0
    answered: int = 0
    correct: int = 0


class QuizMeOut(BaseModel):
    bests: List[QuizBestOut]
    stats: QuizStatsOut
    #: Carried here as well as on /v1/me so the quiz page can tell whether to ask
    #: for one without a second round trip.
    nickname: Optional[str] = None

"""Pydantic v2 request/response models."""

from __future__ import annotations

from typing import Dict, List, Optional

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
    displayName: str


class ProfileOut(BaseModel):
    email: str
    displayName: Optional[str] = None


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

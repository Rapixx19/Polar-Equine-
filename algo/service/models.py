"""Pydantic request/response models for the algo service.

Slice 10: ``/compute`` and ``/recompute`` take ``{ session_id }`` only.
Slice 9's ``{ rr_ms: int[] }`` shape is gone (Rule 13: response shape change
bumps algo_version to 0.3.0).
"""

from __future__ import annotations

from typing import Literal

from pydantic import UUID4, BaseModel, ConfigDict, Field


class ComputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID4


class RecomputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID4


class ComputeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["complete"]
    metrics_id: str
    label_count: int = Field(
        0, description="Stub for Slice 13 gait detection; always 0 in V0.0"
    )
    algo_version: str

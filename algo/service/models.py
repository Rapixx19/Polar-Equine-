"""Pydantic request/response models for the algo service.

`extra='forbid'` everywhere (Rule 9 + algo style guide). RR bounds match the
physiological clamps in algorithms.rr_cleaning.CleaningConfig defaults.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ComputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rr_ms: list[int] = Field(..., min_length=30, max_length=50_000)


class ComputeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rmssd_ms: float
    sdnn_ms: float
    pnn50_pct: float
    pnn20_pct: float
    mean_rr_ms: float
    n_beats: int
    rr_cleaning_quality: float
    hrv_completeness_quality: float
    algo_version: str

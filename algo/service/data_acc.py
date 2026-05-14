"""Supabase data layer for ACC samples + auto-generated gait labels.

Kept separate from ``data.py`` so the HR/HRV pipeline stays under Rule 1's
150-line budget. ``write_labels`` is delete-then-insert per session: a recompute
must replace stale auto labels rather than accumulate them. Manual /
corrected labels are kept untouched (``source = 'auto'`` filter on the delete).
"""

from __future__ import annotations

from typing import Any, cast

import numpy as np

from service.data import get_supabase_client
from service.data_types import LabelRow, SamplesAcc

_PAGE_SIZE = 1000
_INSERT_CHUNK = 500


def read_acc_samples(session_id: str) -> SamplesAcc:
    """Read ACC samples for a session, paginated. Missing axes default to 0.0."""
    ts: list[int] = []
    axs: list[float] = []
    ays: list[float] = []
    azs: list[float] = []
    offset = 0
    while True:
        res = (
            get_supabase_client()
            .table("samples_acc")
            .select("timestamp_ms,ax,ay,az")
            .eq("session_id", session_id)
            .order("timestamp_ms")
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        raw_page = res.data or []
        page: list[dict[str, Any]] = [dict(cast("dict[str, Any]", r)) for r in raw_page]
        for row in page:
            ts.append(int(row["timestamp_ms"]))
            axs.append(float(row["ax"]) if row["ax"] is not None else 0.0)
            ays.append(float(row["ay"]) if row["ay"] is not None else 0.0)
            azs.append(float(row["az"]) if row["az"] is not None else 0.0)
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return SamplesAcc(
        timestamp_ms=np.asarray(ts, dtype=np.int64),
        ax=np.asarray(axs, dtype=float),
        ay=np.asarray(ays, dtype=float),
        az=np.asarray(azs, dtype=float),
    )


def delete_auto_labels(session_id: str) -> None:
    """Drop only auto-generated labels for this session. Manual + corrected stay."""
    (
        get_supabase_client()
        .table("labels")
        .delete()
        .eq("session_id", session_id)
        .eq("source", "auto")
        .execute()
    )


def write_labels(rows: list[LabelRow]) -> None:
    """Bulk-insert label rows in chunks. No-op on empty list."""
    if not rows:
        return
    payload: list[dict[str, Any]] = [
        {
            "session_id": r.session_id,
            "start_ms": r.start_ms,
            "end_ms": r.end_ms,
            "label_type": r.label_type,
            "jump_count": r.jump_count,
            "confidence": r.confidence,
            "source": r.source,
        }
        for r in rows
    ]
    client = get_supabase_client()
    for i in range(0, len(payload), _INSERT_CHUNK):
        client.table("labels").insert(payload[i : i + _INSERT_CHUNK]).execute()

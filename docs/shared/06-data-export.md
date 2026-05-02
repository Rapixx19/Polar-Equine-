# shared/06 · Data Export

## Why this exists

The thesis chapter, the peer-reviewed paper, and Sharad's algorithm work all need data out of Supabase in formats that aren't a Postgres connection. This spec defines how data leaves the system cleanly, traceably, and reproducibly.

## Export formats supported

| Format | Use case |
|---|---|
| Parquet | Large datasets, Sharad's pandas/numpy work, archival |
| CSV | Quick spot-checks, sharing with vets, Excel-friendly |
| JSON | API consumers, single-session inspection |

## What can be exported

### 1. Single session

A complete session as a multi-file Parquet bundle:

```
session_{uuid}/
├── metadata.json              ← session row + horse + rider info
├── samples_hr.parquet         ← raw HR + R-R + contact
├── samples_acc.parquet        ← raw 52Hz accelerometer
├── samples_ecg.parquet        ← raw 130Hz ECG
├── rr_clean.parquet           ← cleaned R-R series with quality flags
├── labels.parquet             ← gait segments (auto + rider corrections)
└── metrics.json               ← session_metrics row
```

### 2. Per-horse dataset

All sessions for one horse, packaged for trend analysis:

```
horse_{uuid}/
├── horse.json                 ← horse profile
├── sessions.parquet           ← all session_metrics rows
├── samples_hr_combined.parquet  ← all HR samples, indexed by session_id
└── labels_combined.parquet    ← all labels, indexed by session_id
```

### 3. Full study export

Everything from the field study, anonymized:

```
study_export_{date}/
├── manifest.json              ← export config, date, version, counts
├── horses.parquet
├── riders.parquet (anonymized — display_name only)
├── sessions.parquet
├── samples_hr.parquet         ← all HR samples
├── samples_acc.parquet        ← all ACC samples
├── samples_ecg.parquet        ← all ECG samples (large, optional)
├── labels.parquet
├── session_metrics.parquet
└── data_quality.parquet
```

## How exports run

A Python script in `lafattoria-algo/scripts/export.py` that:

1. Reads from Supabase using service-role key
2. Streams data into Parquet files (memory-efficient, large datasets supported)
3. Uploads to Supabase Storage in a separate `exports` bucket
4. Returns a signed URL valid for 24 hours
5. Writes a manifest entry to track what was exported and when

```bash
# CLI usage
python scripts/export.py session --id $SESSION_ID --out ./exports/
python scripts/export.py horse --id $HORSE_ID --out ./exports/
python scripts/export.py study --since 2026-01-01 --out ./exports/
```

## Anonymization for paper-ready exports

For the peer-reviewed paper, riders must be anonymized:

```python
# scripts/export.py

def anonymize_riders(df):
    """
    Replace rider emails and names with stable pseudonyms.
    Preserves rider_id continuity (Rider-A throughout dataset).
    """
    rider_ids = df["rider_id"].unique()
    pseudonyms = {rid: f"Rider-{chr(65+i)}" for i, rid in enumerate(rider_ids)}
    df["rider_pseudonym"] = df["rider_id"].map(pseudonyms)
    df = df.drop(columns=["rider_id", "rider_email", "display_name"])
    return df
```

Horses can stay named (Hippo, Venus, etc.) — the paper is about horse physiology, not human privacy.

## Reproducibility — the manifest

Every export writes a `manifest.json`:

```json
{
  "export_id": "uuid",
  "export_type": "study",
  "created_at": "2026-04-15T10:30:00Z",
  "filters": {
    "since": "2026-01-01",
    "until": "2026-04-15",
    "min_quality": 0.7
  },
  "counts": {
    "horses": 8,
    "riders": 5,
    "sessions": 234,
    "samples_hr": 1_876_432
  },
  "algo_version": "0.3.1",
  "schema_version": 1,
  "git_commit_web": "abc123...",
  "git_commit_algo": "def456..."
}
```

This is what makes the export *reproducible*. Six months from now, an examiner asking "exactly which data did your paper use?" gets a complete answer.

## Storage and retention

| Bucket | Contents | Retention |
|---|---|---|
| `exports/raw` | Generated Parquet files | 90 days, then archived |
| `exports/published` | Exports tied to a paper or thesis chapter | Forever |
| `exports/manifests` | Manifest JSON files | Forever |

Published exports are immutable. Once a paper uses an export, that export is locked.

## Files

```
lafattoria-algo/scripts/export.py                 ← ≤ 150 lines, CLI entry
lafattoria-algo/algorithms/exporters/             ← per-type exporter modules
  ├── session_exporter.py                          ← ≤ 130 lines
  ├── horse_exporter.py                            ← ≤ 130 lines
  └── study_exporter.py                            ← ≤ 150 lines
lafattoria-algo/algorithms/exporters/anonymize.py  ← ≤ 80 lines
lafattoria-algo/algorithms/exporters/manifest.py   ← ≤ 100 lines
tests/integration/test_export.py
```

## Integration test

```python
def test_session_export_round_trips():
    """Export a session, read the Parquet back, samples match DB."""
    session_id = seed_test_session()
    
    bundle_path = export_session(session_id, out_dir="./tmp")
    
    hr_df = pd.read_parquet(bundle_path / "samples_hr.parquet")
    db_hr = fetch_hr_samples(session_id)
    
    assert len(hr_df) == len(db_hr)
    assert hr_df["hr_bpm"].sum() == db_hr["hr_bpm"].sum()

def test_study_export_anonymizes_riders():
    """A study export contains pseudonyms, not real rider info."""
    bundle = export_study(since="2026-01-01")
    riders_df = pd.read_parquet(bundle / "riders.parquet")
    
    assert "rider_email" not in riders_df.columns
    assert "display_name" not in riders_df.columns
    assert riders_df["rider_pseudonym"].str.startswith("Rider-").all()
```

## Admin UI

In `/admin` add an "Exports" tab where admin can:

- Click "Export this session" on any session detail page
- Click "Export all sessions for [horse]" on horse detail
- Trigger a full study export (admin only, takes a few minutes)
- See a list of past exports with download links

This is the surface a thesis examiner or paper reviewer asks for: "send me your data." One click, one signed URL.

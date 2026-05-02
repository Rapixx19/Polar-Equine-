# shared/12 · V.1 Evolution Path

## Why this exists

V.0 is the foundation. V.1 is what V.0 was preparing for. This spec sketches the path so that:

1. The V.0 data we collect is in the right shape for V.1
2. The V.0 architecture supports V.1 changes without rewrites
3. We don't accidentally make V.0 decisions that block V.1
4. When V.1 hardware ships (~6 months), the software upgrade is days of work, not months

This isn't a V.1 spec. V.1 will have its own. This is the **bridge document**.

## What V.1 actually is

When P-V0 hardware (Prototipalo's first custom band) ships, V.1 software adds:

| Capability | Why now possible | Source data |
|---|---|---|
| Continuous skin temperature trending | Hardware now has thermistor on chest | New `samples_temp` stream |
| Respiratory rate baseline | Hardware now has barometer | New `samples_baro` stream |
| Sleep / recumbency detection | 24/7 wear + IMU stillness | Existing ACC stream + duty cycling |
| Sub-clinical illness early-warning | Continuous baselines available | All streams + EWMA |
| Whoop-style readiness 0-100 | Continuous baselines available | Composite metric |
| Trained ML gait classifier | 200+ corrected sessions in dataset | V.0 training data |
| Adaptive duty cycling | Firmware accepts cloud parameters | Cloud-side rule engine |

Each of these maps to a new **algorithm module** in `lafattoria-algo/algorithms/`. V.0 architecture already supports plug-in modules (Rule 2 in `.cursorrules`).

## What changes in code (V.0 → V.1)

The estimate is roughly:
- **~95% of V.0 codebase unchanged**
- **~1,200 new lines** of Python algorithms
- **~400 new lines** of TypeScript for new sensor streams + new screens
- **3-4 new database migrations**

This is intentional. V.0 is designed to be a stable foundation, not throwaway scaffolding.

### What stays the same

- Two-repo architecture (web on Vercel, algo on Railway)
- Database schema for sessions, samples_hr, samples_acc, samples_ecg, labels, session_metrics
- Auth model (magic-link riders + admin role)
- BLE pairing flow (just a new device type)
- Job queue and retry logic
- Admin dashboard structure
- Data export contracts (Parquet schemas)
- All existing algorithm modules (rr_cleaning, hrv_metrics, trimp_zones, recovery_tau, gait_detection, anomaly_rest, session_metrics, data_quality)

### What gets added

```
algorithms/
  ├── (existing modules unchanged)
  ├── skin_temp_baseline.py          ← V.1 NEW
  ├── respiratory_rate.py            ← V.1 NEW (from barometer)
  ├── sleep_detection.py             ← V.1 NEW (continuous IMU + baro)
  ├── readiness_score.py             ← V.1 NEW (composite 0-100)
  ├── illness_ewma.py                ← V.1 NEW (multi-signal anomaly)
  ├── strain_score.py                ← V.1 NEW (TRIMP → 0-21 scale)
  ├── gait_detection_ml.py           ← V.1 NEW (trained classifier; old rule-based stays as fallback)
  └── duty_cycle_decider.py          ← V.1 NEW (cloud-side adaptive sensing)

web/
  ├── (existing files unchanged)
  ├── (rider)/home/page.tsx          ← V.1 EXTENDED (readiness card added to vitals home)
  ├── components/readiness/          ← V.1 NEW
  ├── components/illness-alerts/     ← V.1 NEW
  └── api/duty-cycle/                ← V.1 NEW (sends band parameters)

supabase/migrations/
  ├── (existing 001-011 unchanged)
  ├── 012_samples_temp.sql           ← V.1 NEW
  ├── 013_samples_baro.sql           ← V.1 NEW
  ├── 014_readiness.sql              ← V.1 NEW
  └── 015_illness_flags.sql          ← V.1 NEW
```

### What gets retired

Possibly nothing. The rule-based gait classifier might stay as a validation reference even after the ML one ships. The anomaly detection from `algorithms/08-anomaly-rest.md` becomes a special case of the broader illness_ewma.

## How V.0 data feeds V.1

### Path 1 — Training the gait classifier

```
V.0 collects:    rider-corrected gait labels in `labels` table
                 raw ACC samples in `samples_acc`
                 ↓
V.0 exports:     gait_windows.parquet (per shared/10-training-dataset.md)
                 ↓
V.1 trains:      1D CNN or LSTM on the windows
                 (TensorFlow / PyTorch, in a Jupyter notebook,
                  not in production code)
                 ↓
V.1 deploys:     trained model file to algo service
                 algorithms/gait_detection_ml.py wraps the model
                 with same public function signature as v0's
                 algorithms/gait_detection.py
                 ↓
V.1 runs:        new compute pipeline calls gait_detection_ml.detect_gaits()
                 instead of gait_detection.detect_gaits()
                 ↓
V.0 fallback:    if ML classifier fails or confidence is too low,
                 fall back to the rule-based classifier
                 (defense-in-depth, both algorithms maintained)
```

### Path 2 — Validating R-R cleaning

V.0's R-R cleaning is wrapped Lipponen-Tarvainen (per `algorithms/02-rr-cleaning.md`). V.1 might add a learned approach.

The training data: `rr_pairs.parquet` (per `shared/10-training-dataset.md`).
- For each beat: raw R-R, cleaned R-R, was_corrected flag, correction_reason
- For sessions with manual review: accept/reject judgment from a vet

V.1 trains a classifier on (raw R-R series, surrounding context) → (clean / correct / interpolate). The current rule-based version becomes a baseline to beat.

### Path 3 — Establishing per-horse baselines

V.0 collects per-horse rest-session metrics (HR, RMSSD, etc.) over 3 months. By the time V.1 hardware ships:

- ~20-50 rest sessions per horse with cardiac data
- Strong baseline distributions (mean, SD) per horse
- Known seasonal/training-cycle patterns

V.1 hardware adds skin temp + resp rate, but the *baseline framework* — anomaly detection via EWMA on per-horse historical data — is already proven on cardiac signals in V.0. V.1 just adds more signals to the same framework.

## Design decisions made now to support V.1

These are choices in V.0 that exist *because* V.1 is coming:

1. **Raw data preserved forever** (Rule 8). V.1 algorithms may need to re-process V.0 sessions; raw samples must be available untouched.
2. **Algorithm modules expose a single public function** (Rule 3). New V.1 algorithms drop in without disturbing V.0 callers.
3. **`source` column on labels** (`auto`/`corrected`/`manual`). V.1 ML training needs to know what's ground truth.
4. **`label_corrections` audit table** (`shared/11-correction-tracking.md`). Confusion matrix for V.1 baseline-beating.
5. **`algo_version` recorded on every metric**. When V.1 ships and recomputes V.0 sessions, you can compare V.0 vs V.1 outputs.
6. **JSON breakdown column on `session_metrics.notes`**. New algorithm outputs add fields here without schema migrations.
7. **HTTP boundary between web and algo**. V.1 swaps algorithms without touching web.
8. **Quality scores on every output**. V.1 algorithms inherit the quality contract.

## Order of V.1 work (when hardware ships)

When P-V0 band arrives, the recommended sequence is:

### Week 1 — BLE integration

- Update `lib/ble/` with the custom band's BLE characteristics
- Add `samples_temp` and `samples_baro` ingest endpoints
- Test on yourself: temp/baro/IMU data lands in DB

### Week 2 — Algorithm modules

- Implement `skin_temp_baseline.py`, `respiratory_rate.py` (cardiac-style trend tracking, simple)
- Run on V.0 data retroactively (no temp/baro data, so just stub for now — these activate from V.1 forward)

### Week 3 — ML gait classifier training

- Pull the latest training_dataset export
- Train a 1D CNN in a notebook
- Validate against V.0 holdout split
- If accuracy > V.0 rule-based baseline + 5%, ship it as `gait_detection_ml.py`
- Otherwise, defer; refine training; try again

### Week 4 — UI surfaces

- Readiness card on vitals home
- Illness alerts on admin dashboard
- Duty cycle controls in admin

### Week 5 — Field study restart

- Same horses, same riders, V.1 band on
- New baselines start accumulating
- V.1 paper outline begins

## What stays in V.0 even after V.1 ships

The PWA logging flow, the H10 BLE integration, the rule-based classifier — all of it stays. Reasons:

1. **Backup hardware** — if a custom band fails, you can fall back to H10 Equine and still capture sessions
2. **Validation reference** — V.1's ML classifier is validated against the V.0 rule-based baseline
3. **Multi-band families** — eventually a stable might have a mix of H10 Equine + custom bands
4. **Reproducibility** — papers based on V.0 data must remain re-runnable

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| V.1 hardware ships with unexpected sensor changes | Architecture is sensor-agnostic; new streams plug in without disturbing existing flow |
| ML classifier underperforms rule-based on V.0 data | Keep rule-based as fallback; ship ML only when it beats baseline |
| V.0 data turns out to have systematic gaps | Correction tracking (`shared/11`) surfaces this monthly, not at V.1 launch |
| Prototipalo delays band by months | V.0 keeps producing data on H10 Equine; V.1 launch slips but field study continues |
| ML engineer takes longer than expected to train | Rule-based V.0 is already deployed and working; V.1 ships when ready |

## Success criteria for V.0 enabling V.1

V.0 succeeds at preparing for V.1 when:

- ✅ Training dataset export produces clean Parquet with ≥30K labelled gait windows
- ✅ Per-horse cardiac baselines exist with ≥20 rest sessions each
- ✅ Correction tracking shows classifier improvement curve over 3 months
- ✅ Code architecture allows adding 3+ new algorithm modules without touching existing code
- ✅ A new freelancer can read V.0 specs and build a V.1 algorithm module in <1 week
- ✅ Raw data is still the source of truth (no information loss in cleaning/classification)

If all six are green at end of V.0, V.1 work can start immediately when hardware arrives.

## A note on the bigger picture

V.0 looks small and unambitious from the outside — "just collect cardiac and motion data on stock hardware." This is intentional.

The reason V.0 is small is so V.1 can be done well. Every shortcut taken in V.0 to ship faster is a shortcut V.1 has to clean up before it can ship. The discipline of saying "no, that's V.1" in V.0 is what makes V.1 possible.

When V.1 ships, the headline isn't "we built custom hardware." It's "we have 6 months of validated, labelled data on real horses, and our algorithms are peer-review-defensible." That's the moat. V.0 is how it gets built.

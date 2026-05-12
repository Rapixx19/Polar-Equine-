# algorithms/06 · Gait Detection

> **Status:** spec rewritten 2026-05-12 to reflect the equine gait classification literature review. Prior spec assumed 52 Hz ACC + single-band threshold classifier — both are corrected here.

## Feature scope

Classify each session window as **halt / walk / trot / canter-gallop / mixed**, plus a separate jump-event detector. Output writes to `gait_segments` rows for the admin dashboard and `label_corrections` ground-truth via the rider quick-label UI. Algorithm runs server-side in `algo/algorithms/gait.py` on Railway. No on-device inference.

Honest expected accuracy on Polar H10 Equine chest-girth placement: **78–85% balanced accuracy** on walk / trot / canter, with trot the weakest class (~75–82%). Walk and canter are easier. Jump detection is reliable; jump type classification is not.

The number is grounded in:
- [Sageder et al. 2025 *Animals*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12024389/) — rider-worn chest accel hit 71.4% (4 classes), best ensemble 89.7%. Horse-mounted chest girth sees gait signal directly, not damped through a rider, so we sit between these.
- [*Sensors* 2023 review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10386433/) — single-IMU accel-only ceilings vs multi-IMU with gyro.
- [Rana & Mittal 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC9817528/) — phone-in-pocket BiLSTM hit 94.4% with gyro available. We don't have gyro on H10, so subtract ~10 pp.

## Hardware input contract

This is the floor any sensor must meet for the classifier to work without retraining.

| Spec | Value | Source |
|---|---|---|
| Modality | 3-axis accelerometer | Polar H10 PMD `ACC` stream |
| Sample rate | ≥ 50 Hz (V.0: 200 Hz, downsampled internally) | Trot fundamental ~3 Hz; Nyquist + headroom |
| Range | ≥ ±8 G | Canter peak vertical impulse ~4 G; jumps up to ~6 G |
| Word size | int16 minimum | H10 native; supports range above |
| Axis alignment | Arbitrary (girth strap rotates over session) | Pipeline uses vector magnitude ‖a‖ — orientation-invariant |
| Gyroscope | Not required | H10 has none; classifier compensates with autocorrelation features |

**V.1 custom band substitution:** as long as the new band exposes ≥ 50 Hz tri-axial accel at ≥ ±8 G, this classifier deploys unchanged. If the band adds magnetometer (`mag`) the pipeline can gain ~3–5 pp via orientation tracking — but this is an enhancement path, not a precondition. See `docs/V1_BACKLOG.md` → "V.1 custom-band sensors".

The H10 accelerometer itself is scientifically validated for sports use: static error 2.6–4.3% vs gravity reference, dynamic correlations 0.888–0.954 vs gold-standard ([Riemer et al. 2022 *Engineering Proceedings*](https://www.mdpi.com/2673-4591/27/1/71)).

## Pipeline

```
200 Hz tri-axial ACC chunks (Supabase Storage signal-blobs/)
        ↓
Decode binary chunks into (t_ms, ax, ay, az) per session
        ↓
Anti-alias filter (FIR low-pass at 25 Hz)
        ↓
Downsample 200 Hz → 50 Hz
        ↓
Bandpass 0.3–20 Hz (drop DC drift + high-frequency vibration)
        ↓
Vector magnitude ‖a‖ = √(ax² + ay² + az²)
        ↓
Sliding 2-second windows with 50% overlap (100 samples/window @ 50 Hz)
        ↓
Per-window feature vector (~15 dim):
   • Time domain: mean, std, RMS, signal-magnitude-area, zero-crossing rate
   • Frequency: dominant freq in 0.5–6 Hz band, spectral entropy
   • Band power: 0–1 Hz, 1–2.5 Hz, 2.5–4 Hz, 4–6 Hz
   • Autocorrelation: peak lag (stride period, robust where FFT noisy)
   • Variance of |a| derivative (impulse roughness)
        ↓
Random Forest (200 trees, max_depth 10) — multi-class
        ↓
Per-window confidence + label: halt | walk | trot | canter | mixed
        ↓
3-window majority-vote smoothing (recovers 2–5 pp)
        ↓
Merge contiguous same-label windows → gait_segments rows
        ↓
+ Separate one-vs-rest jump detector (vertical impulse > 3 G followed by
  free-fall signature ‖a‖ → near 0) — runs in parallel, not part of RF
```

**Why Random Forest, not deep learning:**
- The 2025 SHAP/XAI paper hit 82.3% accuracy on accel-only neck data with RF — directly matching our target band.
- ConvLSTM2D on chest-mounted data hit only 71.4% (Sageder 2025) and requires 32K parameters + GPU.
- RF is interpretable (feature importance ranks publishable in thesis), trains in seconds, runs in microseconds, and produces calibrated confidences.

**Why 2 s / 50% overlap:**
- Kamminga "Horsing Around" dataset is published at 2-second windows.
- Trot stride period ~0.6 s; 2 s captures 3+ strides — enough for stable FFT.
- 50% overlap is the modal choice in IMU classification literature.

**Why downsample 200 → 50 Hz:**
- Gait fundamentals are 0.5–4 Hz; even canter harmonics rarely matter above 20 Hz.
- 4× CPU saving without information loss.
- Matches V.1 band IMU floor — no retraining if hardware substitutes.

## Validation plan

**Stage 1 — Public dataset (before any rider data):**

Use the [Kamminga "Horsing Around" dataset](https://data.4tu.nl/articles/dataset/Horsing_Around_-_A_Dataset_Comprising_Horse_Movement/12687551) (CC0 license, 18 horses, 100 Hz neck-mounted IMU, 1.2M 2-second samples, 93,303 labeled). Train + cross-validate. Target: **≥78% balanced accuracy** on walk / trot / canter on a held-out horse split (between-horse generalisation, not within-horse).

Stage 1 lives in `algo/algorithms/gait_kamminga_validation.py`. It is a one-shot script, not part of the runtime path.

**Stage 2 — Rider-labeled H10 sessions:**

Once Slice 15 quick-label UI ships and we accumulate ≥10 sessions with rider labels, retrain (or fine-tune feature thresholds) on H10 chest-girth data. Target: **≥75% balanced accuracy** on a horse-held-out split. The 3 pp drop vs neck-collar is the documented placement penalty.

If Stage 2 falls below 70%, kill switch: classifier becomes "moving / not moving" binary, rider quick-label provides all gait labels manually. Document the failure mode honestly in the thesis methods chapter.

## Output schema

```python
@dataclass
class GaitSegment:
    session_id: UUID
    start_ms: int
    end_ms: int
    label: Literal['halt', 'walk', 'trot', 'canter', 'mixed', 'jump']
    confidence: float           # 0..1 from RF predict_proba (or jump detector)
    jump_count: int = 0         # populated only for label='jump'
    algo_version: str           # bumped on every algorithm change (Rule 13)
    source: Literal['algorithm', 'rider_correction']
```

Writes to `gait_segments` table. Rider corrections from the quick-label UI write `label_corrections` rows that **shadow** but don't overwrite the algorithm output — Rule 8, raw data is sacred, including raw algorithm output.

## Failure modes documented in the literature

| Issue | Behaviour | Mitigation |
|---|---|---|
| Rider weight transfer creates 0.5–2 Hz artefacts overlapping walk | Walk over-predicted in active riding | Vector magnitude (rider-invariant vs per-axis); train on multi-rider data |
| Individual horse rhythm varies ±15% | Cross-horse accuracy 5–10 pp lower than within-horse | Per-horse calibration after 1–2 labeled sessions; document in onboarding |
| Girth strap rotation over 45-min session | Per-axis features drift | Magnitude-based; periodic gravity recalibration during detected halts |
| Walk → trot, trot → canter transition windows | 30–50% of all errors live here | Report performance on stationary segments separately; HMM smoothing |
| Surface change (sand vs grass vs hard) | Vertical impulse shifts 10–20% | Train on surfaces we'll deploy on; document surface metadata per session |
| Class imbalance (~60% walk / 25% trot / 12% canter / 3% other) | Raw accuracy misleading | Always report balanced accuracy + per-class F1 |
| Canter vs gallop separability | Chest accel can't reliably split them | Merged for V.0; stride-frequency threshold at ~3.5 Hz noted as V.1 path |
| Short session (< window length) | Returns empty list | Rider labels manually via quick-label UI |

## Public interface

```python
# algo/algorithms/gait.py

from dataclasses import dataclass
from typing import Literal
import numpy as np
import pandas as pd

ALGO_VERSION = "gait-0.1.0"   # bumped on every change per Rule 13

@dataclass
class GaitConfig:
    window_s: float = 2.0
    overlap: float = 0.5
    target_fs_hz: float = 50.0
    bandpass_hz: tuple[float, float] = (0.3, 20.0)
    rf_n_estimators: int = 200
    rf_max_depth: int = 10
    smoothing_windows: int = 3            # majority-vote kernel size
    jump_peak_min_g: float = 3.0
    jump_min_separation_s: float = 1.0


def detect_gaits(
    acc_samples: pd.DataFrame,            # columns: t_ms, ax, ay, az
    config: GaitConfig = GaitConfig(),
    model_path: str = "models/gait_rf_v0.1.joblib",
) -> list[GaitSegment]:
    """
    Detect gait segments from chest-mounted triaxial accelerometer.
    See pipeline description above. Loads a pre-trained RF from disk;
    the training script lives in algo/scripts/train_gait_rf.py.

    References:
    - Sageder et al. 2025 Animals 15(8):1080 — rider-worn placement comparison
    - Sensors 2023 23(14):6301 — equine IMU gait analysis review
    - Rana & Mittal 2025 Proc IMechE P J Sports Eng — five-gaited classification
    - Eerdekens et al. 2020 Comput Electron Agric 168:105139 — collar CNN
    - Kamminga et al. 2019 Data 4(4):131 — public horse movement dataset (CC0)
    - Bragança et al. 2017 Equine Vet J 49:545 — distal-limb stride detection
    - Riemer et al. 2022 Eng Proc 27:71 — Polar H10 accel validation
    """
    ...
```

## V.0 → V.1 path

- **V.0:** RF on hand-engineered features, trained on Kamminga + transferred to H10 with rider-label fine-tuning. Lives entirely in `algo/`.
- **V.1 hardware:** if custom band adds magnetometer, add 3 orientation features to the vector and retrain. If it adds gyroscope, expect a 5–10 pp accuracy jump and reconsider deep models. If it adds barometric pressure, add baro-impulse to the jump detector for higher precision.
- **V.1 algorithm:** when ≥ 200 rider-corrected sessions exist, swap RF for a 1D CNN trained on the labeled accel windows. Same public signature; rule-based RF stays as fallback and validation reference.

## Files this slice produces

```
algo/algorithms/gait.py                       — runtime classifier
algo/algorithms/gait_features.py              — feature extraction (split for 150-line rule)
algo/algorithms/gait_jump_detector.py         — separate impulse detector
algo/scripts/train_gait_rf.py                 — one-shot training on Kamminga + H10 labels
algo/scripts/fetch_kamminga.sh                — downloads the CC0 dataset locally
algo/models/gait_rf_v0.1.joblib               — committed (~few MB) for reproducibility
algo/tests/test_gait_synthetic.py             — sinusoidal fixtures per gait
algo/tests/test_gait_kamminga.py              — held-out-horse validation against the public set
algo/tests/fixtures/kamminga_eval_split.parquet  — frozen eval split (small subset of CC0 data)
```

Eight files per the 150-line rule. The training script is one-shot; the runtime path is `algo/algorithms/gait.py` + its two helpers.

## Open questions for the thesis

1. **No published validation of H10 chest-girth specifically for gait classification.** We generate novel data here. Worth documenting carefully as a methods contribution.
2. **Girth vs withers placement gap on the same horse** — unmeasured in the literature. Optional ablation if Slice 13 ships early.
3. **Canter vs gallop separability from chest accel alone** — unresolved; we merge them.
4. **Minimum training data per horse** — unquantified. Plan: 1–2 labeled sessions per new horse minimum.

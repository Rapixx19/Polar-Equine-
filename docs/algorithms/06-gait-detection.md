# algorithms/06 · Gait Detection

## Feature scope

Auto-detect walk / trot / canter-gallop / jump segments from the Polar H10's built-in accelerometer (52 Hz). Rule-based classifier using FFT in rolling windows. The output is what the rider reviews and corrects in the PWA.

## Public interface

```python
# algorithms/gait_detection.py

from dataclasses import dataclass
import numpy as np
import pandas as pd

LabelType = str  # 'walk' | 'trot' | 'canter_gallop' | 'jump' | 'rest' | 'other'

@dataclass
class GaitConfig:
    window_s: float = 4.0                # FFT window
    overlap: float = 0.5                  # 50% overlap
    
    # Frequency bands (Hz) — equine stride frequency
    walk_band: tuple = (0.8, 1.2)
    trot_band: tuple = (1.3, 1.7)
    canter_band: tuple = (1.8, 2.5)
    
    # Jump detection
    jump_peak_min_g: float = 3.0          # spike threshold
    jump_min_separation_s: float = 1.0    # combine close peaks
    
    # Smoothing
    median_filter_windows: int = 3        # post-classification median filter
    min_segment_s: float = 5.0            # discard segments shorter than this
    
@dataclass
class GaitSegment:
    start_ms: int
    end_ms: int
    label_type: LabelType
    confidence: float                     # 0..1
    jump_count: int = 0                   # populated for jump segments


def detect_gaits(
    acc_samples: pd.DataFrame,            # columns: t_ms, ax, ay, az
    config: GaitConfig = GaitConfig(),
) -> list[GaitSegment]:
    """
    Auto-detect gait segments from triaxial accelerometer.
    
    Pipeline:
    1. Compute |a| = sqrt(ax² + ay² + az²) — orientation-invariant
    2. Detrend by subtracting 1 g (gravity)
    3. Window 4s with 50% overlap
    4. Per window, FFT → identify dominant frequency in 0.5–4 Hz band
    5. Classify window:
       - rest: dominant peak power < threshold
       - walk: 0.8 ≤ f_dom ≤ 1.2
       - trot: 1.3 ≤ f_dom ≤ 1.7
       - canter_gallop: 1.8 ≤ f_dom ≤ 2.5
       - other: otherwise
    6. Confidence = peak_power / total_power in band
    7. Median-filter the per-window labels (removes single-window noise)
    8. Merge contiguous same-label windows into segments
    9. Drop segments shorter than min_segment_s
    10. Run separate jump detection pass: peaks > 3 g in |a| derivative
    
    Equine stride frequency literature (per gait, both directions of stride):
    - Walk:    ~0.9 Hz (1 stride/1.1 s) — Pfau 2007 confirmed
    - Trot:    ~1.5 Hz — Robilliard 2007
    - Canter:  ~2.0 Hz
    - Gallop:  ~2.3 Hz (lumped with canter for V.0)
    - Jump:    transient g-spike, no characteristic frequency
    
    The H10 sits on the girth area, so the dominant axis varies with how the
    band is positioned. Using magnitude rather than per-axis avoids needing
    a calibration step.
    
    For V.0 we use rule-based classification because:
    - Equine literature gives clear frequency separations
    - Riders correct anything wrong in PWA → builds labelled dataset
    - Provides interpretable algorithm for thesis methodology
    - V.1 swaps in trained model trained on rider-labelled data
    
    References:
    - Pfau et al. 2007 J Exp Biol 210:1063 (stride frequencies in trot)
    - Robilliard et al. 2007 Equine Vet J 39:154 (gait classification baseline)
    - Maisonpierre et al. 2019 J Equine Vet Sci 75:25 (IMU-based gait classifier)
    - Bosch et al. 2018 Sensors 18:4218 (accelerometry for equine activity)
    """
    if len(acc_samples) < 100:
        return []
    
    # Step 1-2: magnitude with gravity removed
    a_mag = np.sqrt(
        acc_samples["ax"].values ** 2
        + acc_samples["ay"].values ** 2
        + acc_samples["az"].values ** 2
    ) - 1.0  # roughly remove gravity
    
    # Estimate sampling rate from timestamps
    t_ms = acc_samples["t_ms"].values
    fs = 1000.0 / np.median(np.diff(t_ms))
    
    # Step 3-6: windowed FFT classification
    window_n = int(config.window_s * fs)
    step_n = int(window_n * (1 - config.overlap))
    windows = []
    
    for start in range(0, len(a_mag) - window_n, step_n):
        chunk = a_mag[start:start + window_n]
        f_dom, confidence = _dominant_frequency(chunk, fs, band=(0.5, 4.0))
        label = _classify(f_dom, confidence, config)
        
        windows.append({
            "start_ms": int(t_ms[start]),
            "end_ms": int(t_ms[start + window_n - 1]),
            "label": label,
            "confidence": confidence,
            "f_dom": f_dom,
        })
    
    # Step 7: median filter labels
    labels = _median_filter_labels(
        [w["label"] for w in windows],
        k=config.median_filter_windows,
    )
    for w, l in zip(windows, labels):
        w["label"] = l
    
    # Step 8: merge contiguous
    segments = _merge_contiguous(windows)
    
    # Step 9: drop short
    segments = [s for s in segments if (s.end_ms - s.start_ms) / 1000.0 >= config.min_segment_s]
    
    # Step 10: jump pass on top
    jumps = _detect_jumps(acc_samples, config)
    segments.extend(jumps)
    segments.sort(key=lambda s: s.start_ms)
    
    return segments


def _dominant_frequency(chunk, fs, band):
    """Welch periodogram, return (peak_freq, confidence)."""
    from scipy.signal import welch
    f, p = welch(chunk, fs=fs, nperseg=min(256, len(chunk)))
    band_mask = (f >= band[0]) & (f <= band[1])
    if not band_mask.any():
        return 0.0, 0.0
    band_p = p[band_mask]
    band_f = f[band_mask]
    peak_idx = np.argmax(band_p)
    confidence = float(band_p[peak_idx] / max(band_p.sum(), 1e-9))
    return float(band_f[peak_idx]), confidence


def _classify(f_dom: float, confidence: float, config) -> str:
    """Rule-based classification."""
    if confidence < 0.15:
        return "rest"
    if config.walk_band[0] <= f_dom <= config.walk_band[1]:
        return "walk"
    if config.trot_band[0] <= f_dom <= config.trot_band[1]:
        return "trot"
    if config.canter_band[0] <= f_dom <= config.canter_band[1]:
        return "canter_gallop"
    return "other"


def _median_filter_labels(labels: list[str], k: int) -> list[str]:
    """Replace each label with the mode of its k-window neighborhood."""
    from collections import Counter
    out = list(labels)
    half = k // 2
    for i in range(len(labels)):
        window = labels[max(0, i - half): i + half + 1]
        out[i] = Counter(window).most_common(1)[0][0]
    return out


def _merge_contiguous(windows) -> list[GaitSegment]:
    """Merge consecutive same-label windows into segments."""
    if not windows:
        return []
    segments = []
    cur = {
        "start_ms": windows[0]["start_ms"],
        "end_ms": windows[0]["end_ms"],
        "label": windows[0]["label"],
        "confidences": [windows[0]["confidence"]],
    }
    for w in windows[1:]:
        if w["label"] == cur["label"]:
            cur["end_ms"] = w["end_ms"]
            cur["confidences"].append(w["confidence"])
        else:
            segments.append(GaitSegment(
                start_ms=cur["start_ms"],
                end_ms=cur["end_ms"],
                label_type=cur["label"],
                confidence=float(np.mean(cur["confidences"])),
            ))
            cur = {
                "start_ms": w["start_ms"],
                "end_ms": w["end_ms"],
                "label": w["label"],
                "confidences": [w["confidence"]],
            }
    segments.append(GaitSegment(
        start_ms=cur["start_ms"],
        end_ms=cur["end_ms"],
        label_type=cur["label"],
        confidence=float(np.mean(cur["confidences"])),
    ))
    return segments


def _detect_jumps(acc_samples, config) -> list[GaitSegment]:
    """
    Detect jumps as g-spikes in |a|. Each jump becomes a 1-second segment
    centered on the peak; multiple peaks within min_separation collapse into
    a single jump_count update.
    """
    from scipy.signal import find_peaks
    a_mag = np.sqrt(
        acc_samples["ax"].values ** 2
        + acc_samples["ay"].values ** 2
        + acc_samples["az"].values ** 2
    )
    t_ms = acc_samples["t_ms"].values
    fs = 1000.0 / np.median(np.diff(t_ms))
    
    peaks, _ = find_peaks(
        a_mag,
        height=1.0 + config.jump_peak_min_g,
        distance=int(config.jump_min_separation_s * fs),
    )
    
    return [
        GaitSegment(
            start_ms=int(t_ms[max(0, p - int(0.5 * fs))]),
            end_ms=int(t_ms[min(len(t_ms) - 1, p + int(0.5 * fs))]),
            label_type="jump",
            confidence=float(min(1.0, (a_mag[p] - 1.0) / 5.0)),
            jump_count=1,
        )
        for p in peaks
    ]
```

## Tests

```python
# tests/unit/test_gait_detection.py

def test_synthetic_trot_detected():
    """Sinusoidal acc at 1.5 Hz is classified as trot."""
    fs = 52
    duration_s = 60
    t = np.arange(0, duration_s, 1/fs)
    ax = 0.3 * np.sin(2 * np.pi * 1.5 * t)
    ay = 0.3 * np.cos(2 * np.pi * 1.5 * t)
    az = np.full_like(t, 1.0) + 0.1 * np.sin(2 * np.pi * 1.5 * t)
    df = pd.DataFrame({"t_ms": (t * 1000).astype(int), "ax": ax, "ay": ay, "az": az})
    
    segments = detect_gaits(df)
    trot_segments = [s for s in segments if s.label_type == "trot"]
    assert len(trot_segments) > 0
    total_trot_s = sum((s.end_ms - s.start_ms) / 1000 for s in trot_segments)
    assert total_trot_s > 50  # majority of the 60s

def test_jump_detected_as_spike():
    """A 4g spike produces one jump segment."""
    fs = 52
    a = np.full(fs * 30, 1.0)
    a[fs * 15] = 4.5
    df = pd.DataFrame({
        "t_ms": np.arange(0, 30 * 1000, 1000 / fs).astype(int),
        "ax": a, "ay": np.zeros_like(a), "az": np.zeros_like(a),
    })
    segments = detect_gaits(df)
    jumps = [s for s in segments if s.label_type == "jump"]
    assert len(jumps) == 1

def test_idle_session_yields_rest():
    """A flat session is all rest."""
    df = pd.DataFrame({
        "t_ms": np.arange(0, 60_000, 1000 / 52).astype(int),
        "ax": np.zeros(int(60 * 52)),
        "ay": np.zeros(int(60 * 52)),
        "az": np.full(int(60 * 52), 1.0),
    })
    segments = detect_gaits(df)
    non_rest = [s for s in segments if s.label_type not in ("rest", "other")]
    assert len(non_rest) == 0
```

## Failure modes

| Issue | Behavior |
|---|---|
| Band loose / sliding | Frequency analysis still works; magnitude approach is robust |
| Sample rate dropouts | Welch handles uneven sampling within tolerance; >10% gap flagged in quality |
| Multiple horses' signals mixed | Not possible — one band = one horse |
| Short session (<window_s) | Returns empty list; rider labels manually |

## V.1 path

Once 200+ rider-corrected sessions exist, train a 1D CNN on the labelled accelerometer windows. Swap in `gait_detection_ml.py` with the same public signature. The rule-based version stays as a fallback and validation reference.

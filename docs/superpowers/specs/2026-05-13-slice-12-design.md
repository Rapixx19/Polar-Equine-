# Slice 12 — PMD codec (ACC + ECG) — design

**Status:** in flight 2026-05-13. Pulled forward from Phase 4 to run in parallel with Phase 5 admin work. Horse-test window is ~2 days out.

**Why now:** Riders are about to start. ACC/ECG is collected for free if the codec ships. The freelancer (Luigi) M0 gate is reproducing `session_metrics` from anonymised inputs — richer data improves that handoff. Slice 13 (RF gait detection) is blocked on ACC.

**Constraint:** code must be ready-to-test on a real horse before Ferdinand's next stable visit. No "you capture fixtures first" intermediate step — fixture vectors are synthesised from the official Polar PMD spec and validated against horse data on day one.

---

## Scope

In:
- Subscribe to Polar PMD service on already-connected H10.
- Decode ACC (52 Hz, ±8g, 16-bit, full + delta frames) and ECG (130 Hz, 24-bit µV, full frames) on the browser.
- Batch ACC + ECG samples (separate 2-s flush windows) and POST to `/api/ingest/samples`.
- Insert into `samples_acc` and `samples_ecg` (tables already exist from migration 002).
- Admin-side export gate: raw download excludes ACC/ECG arrays unless `?include=acc,ecg` is passed. Default OFF until data is validated.

Out:
- ACC delta frames with non-trivial bit widths beyond what the official PMD spec PDF documents. Implement the spec verbatim; if real H10 frames use a wider variant, fix in iteration after horse test.
- Sample-quality scoring for ACC/ECG (deferred to V.0.1 hardening — Rule 9 still satisfied: failed batches log and surface, never silently drop).
- Gait detection (Slice 13).
- PMD reconnect/backoff (HR's existing reconnect already runs the GATT layer; PMD piggybacks).

## Architecture

```
Browser:
  PolarH10 → BLE notifications
            ├─ HR char (0x2A37)    → hr-codec        → HRBatcher  → POST hr
            └─ PMD data char (FB…) → pmd-codec       → AccBatcher → POST acc
                                                     → EcgBatcher → POST ecg

API (already RLS-gated):
  /api/ingest/samples
    samples.hr  → insert samples_hr   (existing)
    samples.acc → insert samples_acc  (new)
    samples.ecg → insert samples_ecg  (new)

Admin freelancer bundle:
  /api/admin/sessions/[id]/export-raw
    default                          → no samples_acc, no samples_ecg
    ?include=acc                     → samples_acc included
    ?include=acc,ecg                 → both included
```

## File budget (Cursor Rule 1 — every file ≤150 lines; 180 max if splitting harms clarity)

| File | Purpose | Target |
|------|---------|--------|
| `web/lib/ble/pmd-types.ts` (new) | `PmdStreamType`, `AccSample`, `EcgSample`, `PmdFrame` | ~50 |
| `web/lib/ble/pmd-codec.ts` (new) | Pure decoder: stream-type byte + timestamp + frame-type dispatch | ~140 |
| `web/lib/ble/pmd-service.ts` (new) | BLE GATT — control-point start writes + data-char subscribe | ~130 |
| `web/lib/ble/acc-batcher.ts` (new) | 2-s flush window for ACC, mirrors HRBatcher | ~90 |
| `web/lib/ble/ecg-batcher.ts` (new) | 2-s flush window for ECG | ~90 |
| `web/lib/api/ingest-validation.ts` (edit) | Add `accSampleWire` + `ecgSampleWire`, extend samples union | +20 |
| `web/app/api/ingest/samples/route.ts` (edit) | Branch on `samples.acc.length`, `samples.ecg.length` | +30 |
| `web/lib/ble/use-ingest-session.ts` (edit) | Compose PMD subscribe + ACC/ECG batchers next to HR | +40 |
| `web/lib/admin/anonymise-raw.ts` (edit) | Accept `include: { acc, ecg }` flags | +15 |
| `web/app/api/admin/sessions/[id]/export-raw/route.ts` (edit) | Parse `?include=` query | +15 |
| `web/app/admin/sessions/[id]/SessionDetailClient.tsx` (edit) | Two checkboxes adjacent to raw-download button | +30 |
| `web/tests/pmd-codec.test.ts` (new) | Decode spec-synthesised byte vectors | ~140 |
| `web/tests/ingest-acc.test.ts` (new) | POST acc rows, assert RLS + insert | ~120 |
| `web/tests/ingest-ecg.test.ts` (new) | POST ecg rows, assert insert | ~100 |
| `web/tests/admin-export-raw-include.test.ts` (new) | Assert default omit + include flag | ~120 |

## PMD frame format (from the official Polar spec PDF — clean-room)

Each notification on the PMD data char (`FB005C82-…`):

| Bytes | Meaning |
|-------|---------|
| 0 | Stream type: `0x00` ECG, `0x02` ACC |
| 1–8 | Timestamp (uint64 LE, nanoseconds since H10 boot) |
| 9 | Frame type: `0x00` full samples, `0x80` delta |
| 10+ | Payload (depends on stream + frame type) |

### ECG full-frame payload (`0x00 0x00`)

`N` samples of 3 bytes each, signed 24-bit little-endian microvolts. `N ≈ 73` per notification at 130 Hz.

### ACC full-frame payload (`0x02 0x00`)

`N` samples of 6 bytes each: `int16 LE ax, ay, az` (millig units → divide by 1000 to get g). `N ≈ 36` per notification at 52 Hz.

### ACC delta-frame payload (`0x02 0x80`)

Per the spec PDF: reference sample (3× int16 LE = 6 bytes), then a sequence of delta blocks. Each block = `[bit_width: u8] [sample_count: u8] [packed deltas: ceil(bit_width × 3 × sample_count / 8) bytes]`. Each delta is a signed integer of `bit_width` bits applied to ax/ay/az in turn. Decoder rebuilds samples by accumulating deltas from the reference. Spec says bit_width is typically 4–12 bits.

**Implementation honesty note:** delta encoding is the gnarliest part. If real H10 frames decode to non-physical accelerations on the first horse test, the kill switch is to record only full frames (filter `frame_type === 0x00`) until the delta layout is verified. Sample rate drops but the data is still useful.

## Control-point start sequences (verbatim from spec — do not invent)

Start ECG (130 Hz, 14-bit):
```
0x02 0x00 0x00 0x01 0x82 0x00 0x01 0x01 0x0E 0x00
```

Start ACC (52 Hz, ±8g, 16-bit):
```
0x02 0x02 0x00 0x01 0x34 0x00 0x01 0x01 0x10 0x00 0x02 0x01 0x08 0x00
```

Stop is `0x03` + stream type byte.

## Wire shapes (web → API)

```ts
type AccSampleWire = {
  t_ms: number;        // wall-clock ms, derived: pmd_ts_ns - boot_offset_ns → ms
  ax_mg: number;       // signed int, millig
  ay_mg: number;
  az_mg: number;
};

type EcgSampleWire = {
  t_ms: number;
  uv: number;          // signed int, microvolts
};

type IngestBody = {
  session_id: string;
  samples: {
    hr?:  HRSampleWire[];
    acc?: AccSampleWire[];
    ecg?: EcgSampleWire[];
  };
};
```

`t_ms` derivation: on the first PMD frame received in a session, capture `(performance.now() at receive, pmd_ts_ns from frame)`; for subsequent frames, `t_ms = received_at_ms + (frame_pmd_ns - first_pmd_ns) / 1e6`. This anchors the H10 boot clock to wall-clock without trusting either to be perfect.

## Export gate

`anonymiseRawBundle` already strips PII. The gate is about *data maturity*, not privacy — the freelancer shouldn't receive a 6,000-row ACC array if we haven't yet sanity-checked it ourselves.

API contract on `/api/admin/sessions/[id]/export-raw`:
- No `include` query → manifest reports `row_counts.samples_acc` honestly but the `samples_acc` array is `null`.
- `?include=acc` → `samples_acc` array present, `samples_ecg` still `null`.
- `?include=acc,ecg` → both present.
- Unknown tokens (`?include=acc,hr,foo`) → only the recognised ones are honoured; HR is always present.

Admin UI: two unchecked checkboxes next to the raw-download button. Toggling them rewrites the `href` to add `?include=acc[,ecg]`.

## Tests

1. `pmd-codec.test.ts` (no hardware) — for each of:
   - ECG full frame (one synthesised buffer with known 24-bit µV samples) → decoder returns expected `EcgSample[]`.
   - ACC full frame (synthesised int16 LE triples) → expected ax/ay/az and count.
   - ACC delta frame (one ref sample + one block at 4-bit deltas, sample_count=2) → decoder reconstructs the absolute samples.
   - Bad stream-type byte → decoder returns `null` and does not throw.
   - Truncated payload → decoder returns whatever it could decode + does not throw.
2. `ingest-acc.test.ts` — 401/403 paths reuse HR pattern; happy path POSTs `samples.acc=[…]`, assert one `samples_acc.insert` call with right columns.
3. `ingest-ecg.test.ts` — same shape.
4. `admin-export-raw-include.test.ts` — seed session with 1 hr + 1 acc + 1 ecg row, GET with/without `?include=`, assert array presence vs `null`.

## Verification (Ferdinand runs on horse day)

1. `pnpm test && pnpm tsc --noEmit && pnpm lint` all green.
2. Strap H10 on horse, open `/sessions/new`, pick "Riding", record 2 minutes.
3. Stop session. Check Supabase Studio:
   - `samples_hr` count ≈ 120–240 (R-R intervals included).
   - `samples_acc` count ≈ 6,240 (52 Hz × 120 s); `ax_mg`/`ay_mg`/`az_mg` range looks like motion (not all zeros, magnitude near 1000 mg at rest).
   - `samples_ecg` count ≈ 15,600 (130 Hz × 120 s); `uv` swings ±2,000 ish.
4. Open `/admin/sessions/[id]` → Data sources panel reflects real counts.
5. Download raw JSON without checkboxes → ACC/ECG arrays are `null`, counts honest.
6. Tick ACC checkbox → ACC array is populated, ECG still `null`.
7. If any of (3) fails, raise kill switch: gate the writer behind a feature flag, leave HR-only flow intact, fix codec, repeat.

## Kill switch

If after 16 hr of total Slice 12 work the codec doesn't produce horse-plausible values, fall back to:
- ACC: filter `frame_type === 0x00` only (drop delta frames). Ship full-frame ACC only.
- ECG: same fall-back if the 24-bit decode looks wrong.
- Worst case: revert the use-ingest-session edit so PMD subscribe is never called; HR-only V.0 is unchanged. Total revert = one commit.

## Out of scope (explicitly)

- Delta encoding for ECG (spec uses full frames for ECG).
- Sample-quality scoring on ACC/ECG. (V.0.1)
- Storing PMD timestamps separately from `t_ms`. (V.0.1, if needed for re-alignment audit.)
- Streaming ACC/ECG to the rider UI (the rider sees HR; ACC/ECG land in DB for the algo).
- Reconnect logic — HR's existing flow already runs GATT for both services.

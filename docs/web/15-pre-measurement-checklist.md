# web/15 · Pre-measurement Checklist

Operational pre-flight for a clean H10 Equine recording. Two minutes, in
order. Each item exists because a real session has been ruined by skipping
it.

## Why this document exists

Emma's 2026-05-15 ride was the catalyst. The detector and the H10 hardware
both behaved correctly, but the recording was unusable:

- **25 % of wall-clock lost** to three GATT disconnects with no auto-reconnect (now fixed in app — but a strap that disconnects three times is still a strap problem).
- **41 % of HR samples missing RR intervals** — the classic signature of intermittent skin contact: dry electrodes or a loose strap.
- **Average HR 44.8 bpm at trot/canter** — physiologically impossible for a working horse; consistent with the strap reading the rider, not the horse.

The detector saw 26 "jumps" in a walk/trot session with zero actual jumps. Almost all of those were noise the band emitted while it was being yanked, dragged, or losing contact. The fix is upstream of the algorithm.

## The 12-point checklist

Run these in order. Don't skip any.

### Band (5 items)

1. **Battery ≥ 50 %.** Open the Polar Beat / Polar Flow app on a phone you'll *not* use for recording, connect to the H10, read the battery line. Below 50 % the H10 starts dropping ACC/ECG before it drops HR — and you may not notice mid-ride. Replace the CR2025 if uncertain. Spare in pocket.
2. **Inspect electrodes.** Both contact patches on the inside of the strap must be visibly clean and intact. Dried sweat crust under a fingernail = a hard "no". Wipe with a damp cloth, dry off the plastic snaps, re-snap the pod.
3. **Wet the electrodes generously.** Plain tap water on both patches. Not damp — *wet*. The patches must squelch when pressed. Dry contacts is the #1 cause of the "GATT linked but no HR frames" state and of the 41 %-missing-RR pattern.
4. **Strap fit: snug, two-finger.** You should just be able to slide two flat fingers between the strap and the horse. Tighter than that bruises and rubs; looser than that lets the patches drift off-skin during gait transitions.
5. **Position: girth groove, behind the left elbow.** The pod sits roughly under the saddle's billet line, low on the rib cage. Higher and you read more skeletal movement; further forward and the elbow scuffs it every stride.

### Phone & app (4 items)

6. **Browser is Chrome on Android or Bluefy on iOS.** Safari does not support Web Bluetooth. Standard Chrome on iOS also doesn't — Bluefy is the only iOS path.
7. **PWA is installed to home screen** (long-press → Add to Home Screen). The browser tab can sleep mid-ride and kill the BLE link; the PWA stays alive.
8. **Phone battery ≥ 60 %**, screen brightness set so you can read it in sun, **auto-lock disabled** (Settings → Display) or set to never during the session. iOS in particular kills BLE on screen-lock.
9. **Phone stays within ~5 m of the horse.** In an arena that's the rider's pocket. From the ground (lunging, observing) it's the centre of the circle — *not* the gate. Distance is the most common preventable disconnect cause.

### Capture (3 items)

10. **Pair, then wait for the green "Receiving heartbeats" banner.** The Start button is disabled until the first HR frame arrives, but verify visually. If you see "⏳ Waiting for first heartbeat…" for more than ~10 s, re-wet the electrodes — don't tap Start hoping it'll resolve.
11. **Sanity-check the HR number.** A horse at rest reads 28–44 bpm; on a held lead-rope, 36–60. If the live tile shows < 25 bpm or > 100 bpm before you move off, the band is mis-positioned or reading the rider. Re-seat.
12. **All three stream dots green before riding off.** HR, ACC, ECG dots in `LiveVitals` must all be on `live`. "Starting…" is fine for the first ~4 s; "stalled" or "waiting" after that means the PMD start command was rejected (look at the amber diagnostics expander) — re-pair through the picker, not a cached reconnect.

## During the session

- **If you see "⏳ Connection lost — reconnecting…"**, don't panic. The app retries at 1 s, 2 s, 5 s, 10 s. Just keep the horse calm where you are; if the link doesn't come back in ~20 s, move the phone closer to the horse.
- **If you see the red "⚠ Connection lost. Reconnect the band, or tap End to save what we have"** banner, the auto-reconnect exhausted its attempts. Two options:
  - Tap Pair again through the band picker (this resumes the same session — the timeline will have a gap where the link was down, which the analyzer handles).
  - Tap End if the rest of the ride isn't worth saving — partial sessions still produce HR/HRV stats over what was captured.
- **Do not touch the strap mid-ride.** The "jump" signature is identical to grabbing-the-strap. If you must adjust, halt first.

## After the session

- **End the session in the app** before unclipping the strap. An unclipped strap drops GATT before the stop-PATCH lands, which the app handles, but it's cleaner to end first.
- **Rinse the strap** under running water within 10 min. Dried sweat permanently degrades electrode conductivity — this is the slow-motion version of skipping step 3 next time.

## Quick reference: failure modes mapped to this list

| Symptom in the recording | Skipped step |
|---|---|
| GATT keeps disconnecting every few minutes | 4 (fit), 8 (screen-lock), 9 (range) |
| 30–40 %+ HR samples missing RR | 2 (dirty electrodes), 3 (dry) |
| Avg HR implausibly low (< 30 bpm at work) | 5 (position — likely reading rider) |
| ACC/ECG stay at 0, HR fine | Re-paired through cache instead of picker (Chrome blocks PMD on cached re-pair); see step 12 |
| Detector reports many fake jumps in walk/trot | Usually a consequence of 1, 3, or 4 — the strap is being yanked or losing contact, and the noise mimics an impact |

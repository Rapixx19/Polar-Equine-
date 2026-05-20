# web/16 · Rider On-Site Setup Card

One-page, **at the barn**, before mounting. Pairs with `15-pre-measurement-checklist.md` (which is the longer band+phone hygiene doc) — this card is the 30-second Android-specific pre-flight that has to happen on the rider's actual phone the first time they ride a real session post-PR-#61.

## Why this card exists

Two Android rides crashed mid-session on 2026-05-17 (Balasco, Blue) even with Wake Lock and BLE auto-reconnect live. Root cause was Chrome itself being killed by Android — battery saver, Doze, memory pressure. In-page code can't save you when the JS isn't running. The fixes are user-side, set once per phone:

1. Install the PWA (so Android doesn't discard the tab).
2. Whitelist Chrome from battery optimisation (so Doze leaves it alone).
3. Keep the phone in the foreground for the whole ride.

Once these are set on a given phone they persist — but the *first* ride on any new phone needs this card walked through with the rider physically present.

## Before the rider arrives (admin, 5 min)

- [ ] Confirm `/admin/horses` shows `HR max` and `HR rest` on the horse they'll ride. If empty, set them now (resting on lead-rope = HR rest; observed peak from prior session = HR max). Untuned horses get the 225/32 species default, which buries working HR below Z1.
- [ ] Open `/admin/sessions` and confirm no other `active` session for this rider/horse from a prior aborted ride. If there is, end it from the detail page first.

## At the barn, on the rider's phone (3 min, once per phone)

Do these in order. Don't trust the rider's memory — open the settings yourself.

### Step 1 — Install the PWA

1. Open Chrome → navigate to the rider URL → sign in.
2. Three-dot menu → **Add to Home screen** → confirm.
3. Close Chrome. Open the new icon from the home screen. The address bar should be gone.

> If the address bar is still visible, the install didn't take — repeat. The recording UI shows a yellow "Install to home screen" banner when run in tab mode; if the rider sees that banner during the ride, the install was skipped.

### Step 2 — Chrome battery is Unrestricted

1. Long-press the Chrome icon → **App info** → **Battery**.
2. Set to **Unrestricted** (not "Optimised", not "Restricted").

> "Optimised" is the Android default and it's what kills Chrome in the background. Without this step the PWA install isn't enough.

### Step 3 — Battery saver is off

1. Settings → **Battery** → **Battery saver** → off.
2. Settings → Battery → **Adaptive Battery** → off if the rider is willing.

> Adaptive Battery learns from app usage; on a new install Chrome looks idle and gets throttled. Disabling for the duration of testing is safer.

### Step 4 — Sanity check

- Phone battery ≥ 60 %. If below, charge to 60 % before starting.
- Screen auto-lock set to **Never** for the session, or screen on while plugged.
- Bluetooth on, location permission granted to the PWA (Web Bluetooth needs it on Android).

## Just before mounting (30 s)

- [ ] Open the PWA from the home-screen icon (not from a Chrome tab).
- [ ] Pick the horse, pair the band, wait for the green "Receiving heartbeats" banner.
- [ ] Tap Start. Confirm the amber **"Keep this screen open"** note appears under the live chips. That note is the live-confirmation that the foreground-discipline warning shipped — if it's missing, the rider is on an old build, reload the PWA.

## During the ride

- Phone stays in the rider's pocket, screen up, in the foreground. **Do not switch apps.** No music app, no map, no Strava, no answering a call by tapping through. If a call comes in, decline.
- Watch the live chips. If you see the red **"Connection lost"** banner persist > 20 s, dismount, walk the phone within 1 m of the band, and tap Pair again — same session resumes.

## After the ride

- Tap End in the PWA before unclipping the strap.
- On `/admin/sessions`, the just-ended session row should show:
  - Duration > 0
  - Status = `completed` (not `active`)
  - No ⚠N badge in the duration column, OR ≤ 1 if a brief reconnect was recovered

If the row shows status `active` with no recent samples and the rider tells you the phone went dark mid-ride — that's the Red outcome the Saturday decision gate is testing for. Note the wall-clock when the screen went dark, then use the recovery upload panel on the session detail page once the rider's Polar Beat app has synced the chip-memory CSV.

## Failure modes mapped to this card

| Symptom | Likely skipped step |
|---|---|
| Session went to `active` with no end, no recent samples | Steps 1, 2, or 3 (Chrome killed) |
| Address bar visible during ride | Step 1 (PWA not installed) |
| Pair fails repeatedly, never sees first HR | Bluetooth off, or location permission denied |
| ⚠N badge shows ≥ 3 drops but session completed | Step 4 (out of range, or rider switched apps) — review the signal-quality panel on the detail page |

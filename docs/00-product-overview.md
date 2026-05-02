# 00 · Product Overview

## What La Fattoria is

A research data-collection platform that captures heart rate, R-R intervals, accelerometer, and raw ECG from sport horses during defined activities. Riders quickly log and label sessions on their phones; researchers see trends per horse and across the stable in an admin dashboard.

## Who uses it

| Persona | Surface | Auth | What they do |
|---|---|---|---|
| **Rider** | PWA on personal phone | Magic-link email | Start session, ride, end session, approve auto-labels, see their horses |
| **Admin** | Desktop dashboard | Email + admin role | See all sessions, all horses, all trends, manage bands and horses, export data |
| **Algorithm service** | HTTP only | Bearer token | Receives session-end events, computes metrics, posts results back |

## Activity taxonomy (locked, 7 types)

| Code | Display | Sub-types | Auto-detect? |
|---|---|---|---|
| `riding` | Riding session | walk / trot / canter / jump | Yes — segments auto-labelled from ACC |
| `grass_field` | Grass field | — | No — single block |
| `walker` | Horse walker | — | No — single block |
| `stall` | Stall rest | — | No — single block |
| `transport` | Transport | — | No — single block |
| `vet` | Vet / treatment | — + free-text note | No |
| `other` | Other | free-text description | No |

## What problem it solves

Sport stables today rely on:
- Once-monthly vet checks
- Post-exercise eyeballed recovery assessments
- Rider gut feeling

Sentavita captures structured physiological data across every session and rest context, giving the trainer the equivalent of having a sports scientist on staff. For the research thesis, it produces the first dataset comparing physiological signatures across the seven activity contexts on the same horse.

## Why it's framed as research, not as a startup product

- Riders engage more readily with "welfare research" than "startup beta"
- IE supervisor sign-off provides ethical and academic cover
- A peer-reviewed paper validates Sentavita scientifically before commercial launch
- Investors hear "published validation" later, which beats "we built a thing"

The codebase is internally branded **Sentavita**. The user-facing brand is **La Fattoria**. When commercialization happens post-thesis, the data and validation flow forward; the public brand changes.

## V.0 success criteria

- ✓ `lafattoria.app` deployed on Vercel
- ✓ `lafattoria-algo` deployed on Railway
- ✓ Riders can register via magic link and use the PWA on their phones
- ✓ Polar H10 Equine pairs and streams reliably (HR + R-R + ACC + ECG)
- ✓ Full session lifecycle works (start → record → end → review → save)
- ✓ Admin dashboard shows sessions with auto-detected gaits and per-session metrics
- ✓ System scales to multiple bands, multiple horses, multiple riders concurrently
- ✓ Data export to Parquet works for thesis and external analysis

## Field study scope

The system is designed to work with **any number of bands at any number of locations**. Operational scope (how many bands, where they live, how often sessions are logged) is a deployment decision tracked outside the spec, not an architectural constraint.

Storage budget scales linearly with session volume. Plan: start on Supabase Free, upgrade to Pro (€25/mo, 8 GB included) when needed.

### Storage exhaustion math (concrete)

Each 50-minute session produces approximately:
- HR + R-R: ~120 KB
- Accelerometer: ~5 MB
- Raw ECG: ~10 MB
- **Total: ~15 MB per session**

| Tier | Database limit | Sessions before wall |
|---|---|---|
| Supabase Free | 500 MB | ~33 sessions |
| Supabase Pro (€25/mo) | 8 GB | ~530 sessions |

### What to do when the wall hits

When Supabase warns that the database is approaching capacity:

**On Free tier (likely week 1-2):**
- Click "Upgrade to Pro" in Supabase dashboard, €25/mo
- No data loss, no schema changes, no downtime
- Continue normal operations

**On Pro tier (would take 6-12+ months at field study cadence):**
- Move raw ECG samples from `samples_ecg` table to Supabase Storage as Parquet files
- Keep `samples_hr` and `samples_acc` in Postgres (10x smaller, fast query)
- Add a `samples_ecg_storage` reference table that points to Parquet blob URLs
- This is V.1.x work, not V.0 — you have months of runway before this becomes urgent

The deliberate V.0 decision: do not pre-optimize storage. Hit the wall, click upgrade, move on. The cost of "wrong choice" is one short outage and €25.

## V.0 success does NOT require

- All five admin screens polished — three of five is fine
- Perfect gait classifier — 80% accuracy on walk/trot/canter is fine for V.0
- Native iOS app — PWA + Bluefy covers iPhone
- Multi-stable support — V.0 supports any number of stables via `stable_id` on horses; commercialized stable management UI lives in V.2
- All 23 metrics from the original algorithm strategy — V.0 ships with ~10 metrics
- iOS native app — V.1 territory

## Phone / browser support matrix

| Phone | Browser | Status |
|---|---|---|
| Android | Chrome | ✓ Full support |
| Android | Edge, Brave | ✓ Full support |
| Android | Firefox | ✗ No Web Bluetooth |
| iPhone | Safari | ✗ No Web Bluetooth (Apple won't ship it) |
| iPhone | **Bluefy** (free App Store) | ✓ Functional, with documented V.0 onboarding friction (see `web/01-pwa-onboarding.md`) |
| Desktop | Chrome | ✓ Full support (for testing) |

## The competitive shape

| Competitor | Their strength | Where Sentavita beats them |
|---|---|---|
| Polar Flow | Brand, hardware reliability | Equine-specific, multi-horse stable view, rest-context data, exportable raw data |
| Equestic | Stride symmetry, polished iOS app | HR / HRV / recovery / welfare layer, open data, rest-context |
| Arioneo | Racing focus, GPS, established vet partnerships | Sport-horse focus, welfare framing, transparent algorithms |
| Whoop | Excellent recovery framing | Equine-specific (they don't compete here) |

The structural moats — **welfare framing, open data, algorithm transparency, peer-reviewed credibility** — apply at V.0 already.

# shared/04 · V.0 Mission Statement (read this before every change)

## The mission, stated simply

**V.0 software is a data-collection instrument that builds the training dataset for V.1.**

When P-V0 hardware (Prototipalo's custom band) ships in ~6 months, we want to already have:

- A clean, labelled dataset of equine cardiac + motion sessions
- Per-horse baselines on cardiac signals
- Validated algorithms that V.1 can build on top of, not replace
- Documentation strong enough that a new ML engineer can pick up V.1 work without re-deriving V.0 decisions

V.0 has three explicit jobs in priority order:

1. **Collect** — capture every session reliably from Polar H10 Equine
2. **Clean** — make the data trustworthy (R-R artefact correction, quality scoring)
3. **Classify** — auto-detect gaits, riders confirm, build labelled dataset

That is the entire scope. Anything beyond that is V.1 territory and should be deferred.

The labelled output is the actual product. Everything else (admin dashboard, session metrics, recovery τ visualization) is in service of generating better-labelled data, or simply to keep riders engaged enough to keep contributing data. **The data is the deliverable.**

## What V.0 is NOT

The temptation to scope-creep is severe because the data invites interpretation. **Resist it.** V.0 is not:

- A Whoop-style consumer product (no readiness 0-100, strain 0-21)
- A welfare alerting system (no "your horse might be sick" notifications)
- A training optimization tool (no "rest tomorrow" recommendations)
- A multi-stable platform with stable management UI (single deployment per V.0 install)
- A commercial product with paying users (academic research framing)

These are real, valuable features. They belong in V.1, V.2, V.3. They depend on:
- Custom band hardware (skin temp, barometer, 24/7 wear) — Prototipalo, ~6 months
- Validated baselines per horse — needs the V.0 dataset first
- Algorithm validation against vet ground truth — needs the V.0 dataset first
- Multi-stable normative data — needs partnerships beyond CHC

You cannot build V.1 without V.0 succeeding first. **Stay focused.**

## Why the focus matters

A research dataset that is 90% complete and 100% trusted is worth more than a dataset that is 100% complete and 80% trusted. The thesis chapter that publishes V.0 must be defensible. The peer-reviewed paper that legitimizes Sentavita must be defensible. The FEI conversation that opens regulatory mandate paths must be defensible.

Every shortcut in V.0 — every uncleaned sample, every silently-dropped session, every hand-waved metric — undermines the academic credibility that is the entire competitive moat.

If a feature does not directly serve **collect / clean / classify**, defer it.

## Success criteria for V.0 (concrete)

By end of 3-month field study:

- ✅ ≥ 200 sessions logged across multiple horses
- ✅ ≥ 95% of sessions have HR data with quality score ≥ 0.7
- ✅ ≥ 80% of riding sessions have rider-approved gait labels
- ✅ Training dataset export produces ≥ 30K labelled gait windows (per `shared/10-training-dataset.md`)
- ✅ Per-horse cardiac baselines exist with ≥ 20 rest sessions each
- ✅ Correction tracking shows classifier accuracy curve over 3 months
- ✅ Zero data loss events (no session disappears between phone and database)
- ✅ Mean ingest latency < 500 ms
- ✅ Algorithm pipeline runs in < 8 s for 50-min session
- ✅ A new ML engineer can read the algorithm repo cold and build a V.1 algorithm module within 1 week of onboarding

## What "good enough to ship" looks like for V.0

The PWA is good enough when:
- A rider can log a session in 3 taps from app open to recording
- Live HR and signal-quality are visible during recording
- Post-session review takes < 60 seconds for a typical ride
- iPhone via Bluefy works as smoothly as Android via Chrome

The admin dashboard is good enough when:
- You can see today's active sessions live
- You can drill into any session to see full traces
- You can spot a band that's misbehaving (low quality scores, missing data)
- You can export raw data as Parquet for analysis

The algorithm service is good enough when:
- It produces clean R-R intervals indistinguishable from manual review
- It produces gait labels that riders confirm without correction ≥ 75% of the time
- It produces session metrics consistent with established equine literature
- A new freelancer can add a new algorithm module in a day

If a feature meets these bars, ship it. If a feature is "nice to have" beyond these bars, defer it.

## How to evaluate a proposed feature

Run this checklist:

1. **Does it serve collect / clean / classify?** If no → defer to V.1.
2. **Does it require hardware we don't have?** If yes → defer.
3. **Does it depend on a validated baseline we haven't built yet?** If yes → defer.
4. **Can we ship V.0 without it?** If yes → defer.
5. **Will deferring it block the thesis chapter or peer-reviewed paper?** If no → defer.

If a feature passes all five checks (i.e., directly serves the mission and blocks publication), build it. Otherwise, write it down in `V1_BACKLOG.md` and move on.

## A note on Whoop comparisons

We talk about "Whoop for horses" externally because it's a useful shorthand for investors, vets, and federation officials. **It is not a product specification.** The actual Whoop experience requires sensors and continuous wear we won't have until V.1. Internally, never let the Whoop framing drive feature decisions before V.1 hardware exists.

## When this document conflicts with another spec

This document wins. The other spec is wrong; fix it.

# shared/03 · Incident Response

What to do when things break. Calibrated for a one-person + one-freelancer team. Speed > formality.

## Severity levels

| Level | Definition | Response time |
|---|---|---|
| **SEV-1** | Production down (lafattoria.app unreachable, can't log in) | < 30 minutes |
| **SEV-2** | Feature broken (sessions not saving, BLE not connecting) | < 4 hours |
| **SEV-3** | Degraded experience (slow loading, occasional errors) | < 24 hours |
| **SEV-4** | Cosmetic / non-blocking | Next sprint |

## Communication

For V.0, an incident notification is just:
- Slack/WhatsApp message to Sharad (if he's involved): "production is down, status here"
- Update GitHub issue if it relates to a known bug
- For admin / stable users: email if any user-facing impact lasts > 30 minutes

V.1 / commercial: status page (status.lafattoria.app), incident postmortems, on-call rotation.

## Common incidents and runbooks

### A. Magic links not arriving in inboxes

**Symptom:** Rider says "I never got the email."

**Triage:**
1. Check Supabase Auth → Email Templates → recent logs
2. Verify the email isn't in spam folder (most common cause)
3. Check if SMTP provider (Resend) has rate-limited

**Fix:**
- If template/Supabase issue: re-send from Supabase dashboard
- If spam: tell user to check spam, mark as not-spam, whitelist `noreply@lafattoria.app`
- If Resend rate limit: upgrade Resend plan or use Supabase's default sender temporarily

### B. PWA can't connect to band (Web Bluetooth fails)

**Symptom:** "Pair a new band" → browser shows picker → no devices appear

**Triage:**
1. Check OS Bluetooth is on (most common cause)
2. Check device is in pairing mode (Polar H10 has no button — wear it for 5 seconds)
3. Check browser supports Web Bluetooth (`'bluetooth' in navigator`)
4. iPhone: confirm using Bluefy, not Safari
5. Check browser console for specific error

**Common errors:**
- `NetworkError: Bluetooth adapter not available` → OS Bluetooth off
- `NotFoundError: User cancelled the requestDevice() chooser` → user closed picker
- `NotSupportedError` → wrong browser

**Fix:** Direct user to setup card / pairing-help URL.

### C. Algo service not responding (compute timeouts)

**Symptom:** Session ends but review screen stuck "Processing your session..."

**Triage:**
1. `curl https://algo.lafattoria.app/health` → 200?
2. Railway dashboard → algo service → recent logs
3. Check if recent deploy broke something
4. Check session in DB: `metrics_status` field

**Fix paths:**
- If health check fails: redeploy via Railway
- If health passes but compute hangs: look at logs for the specific session_id; usually a malformed sample crashing pandas
- If recent deploy: roll back to last green
- Last resort: manually run the compute pipeline locally and write results to DB

### D. Database performance degraded

**Symptom:** API routes slow, dashboard takes > 5s to load

**Triage:**
1. Supabase dashboard → Database → query performance
2. Identify slow queries (look for ones missing indexes)
3. Check sample count: if a single session has > 1M samples, BLE is misbehaving

**Fix:**
- Add missing indexes (always reversible: `DROP INDEX IF EXISTS …` to undo)
- Vacuum/analyze the affected tables
- If sample-count blowup: add ingest-side rate limit (max 200 samples per stream per second)
- Consider archiving old sessions to Storage (move ECG samples to Parquet files)

### E. Session data corrupted (samples missing)

**Symptom:** Admin says "yesterday's session has weird metrics"

**Triage:**
1. Check the raw samples for the session — `SELECT count(*) FROM samples_hr WHERE session_id = '…'`
2. Check for clock issues — timestamps clustered weirdly
3. Check session status — was it abandoned mid-recording?

**Fix:**
- Re-run compute via admin "Re-run algorithms" button
- If samples are genuinely missing: mark session as `metrics_status='failed'` and add admin note
- Never silently fabricate data

### F. Bearer token rejected by algo service

**Symptom:** Web logs show `401 Unauthorized` calling algo

**Triage:**
1. Check `ALGO_BEARER_TOKEN` env var matches in both Vercel and Railway
2. Most common cause: rotated in one but not the other

**Fix:** Sync env vars, redeploy both.

## Backup recovery

If a database is wiped or corrupted:

1. Stop all writes (set Vercel deploys to "Paused", Railway service to "Stopped")
2. Open Supabase dashboard → Database → Backups → Restore to point-in-time
3. Wait for restore (5-30 min for V.0 data volumes)
4. Verify data via spot-check queries
5. Resume Vercel and Railway services
6. Notify users of any data loss window

V.0 data loss tolerance: a session can be lost if it was being recorded during the failure. Stable data: zero tolerance.

## Security incident: leaked credentials

If `SUPABASE_SERVICE_ROLE_KEY` or `ALGO_BEARER_TOKEN` is exposed:

1. **Immediately:** rotate the leaked key in Supabase dashboard
2. Generate new `ALGO_BEARER_TOKEN`, paste into both Vercel and Railway, redeploy both
3. Audit Supabase logs for unauthorized access
4. If suspicious activity: notify users via email
5. Document the incident in the security log

## Postmortem template (for SEV-1 and SEV-2)

After resolution, write a brief postmortem:

```
INCIDENT: [name]
Severity: SEV-X
Started: [time UTC]
Resolved: [time UTC]
Duration: [hours]

WHAT HAPPENED
[1-2 paragraphs]

ROOT CAUSE
[1 paragraph]

WHAT WE DID
[bullet list of actions]

WHAT WE'LL CHANGE
[concrete improvements, e.g. "add monitoring on X"]
```

Store in `lafattoria-web/docs/postmortems/YYYY-MM-DD.md`. Even brief ones — the discipline matters when investors and FEI examiners eventually review.

## Useful commands during incidents

```bash
# Tail Vercel logs
vercel logs --follow

# Tail Railway logs
railway logs

# Supabase emergency SQL
psql $DATABASE_URL    # via Supabase connection string

# Force-end a stuck session
UPDATE sessions SET status='abandoned', end_time=now() WHERE id='…' AND status='active';

# Force re-compute
curl -X POST https://algo.lafattoria.app/recompute \
  -H "Authorization: Bearer $ALGO_BEARER_TOKEN" \
  -d '{"session_id":"…"}'
```

## When to call for help

- Anything stable-facing breaks during a session in progress: project lead handles directly, escalate to algorithm freelancer if it's algorithm-side
- Database corruption or data loss > 1 hour of data: pull in someone with DB experience before doing anything risky
- Security incident (leaked key, unauthorized access): document and rotate, then ask security advisor for review
- FEI/regulatory review concerns: pause changes, escalate to thesis supervisor + federation contact

## Health monitoring (V.0 manual checklist)

Once a week, check:
- ☐ Both deploys are green in their dashboards
- ☐ Recent error count in Sentry < 10/day
- ☐ Latest Supabase backup completed
- ☐ Cost dashboards under expected ceiling
- ☐ One real session ran end-to-end successfully

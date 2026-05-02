# web/01 · PWA Onboarding (Magic Link)

## Feature scope

The first-time-user flow: open `lafattoria.app`, sign in with email, become a rider, see their home screen.

## Depends on

- `03-auth-and-permissions.md`
- `web/11-api-auth.md`

## Public interface

| Route | Component | Purpose |
|---|---|---|
| `/` | `WelcomeScreen` | Pre-auth welcome, email input |
| `/auth/sent` | `MagicLinkSentScreen` | "Check your inbox" |
| `/auth/callback` | `AuthCallback` | Token exchange, redirect to home |
| `/auth/error` | `AuthError` | Expired / invalid link |

## Files in this feature

```
app/(auth)/page.tsx                       ← WelcomeScreen (≤ 80 lines)
app/(auth)/auth/sent/page.tsx             ← MagicLinkSentScreen (≤ 60 lines)
app/(auth)/auth/callback/page.tsx         ← AuthCallback (≤ 100 lines)
app/(auth)/auth/error/page.tsx            ← AuthError (≤ 50 lines)
components/auth/EmailInput.tsx            ← shared email input (≤ 80 lines)
lib/auth/magic-link.ts                    ← client functions (≤ 100 lines)
tests/e2e/onboarding.spec.ts              ← Playwright integration test
```

## Welcome screen design

```
┌────────────────────────────────────────┐
│                                        │
│         [LF]  La Fattoria              │
│         Equine Welfare Study           │
│                                        │
│                                        │
│                                        │
│   Welcome.                             │
│                                        │
│   Enter your email to log in or        │
│   create your account. We'll send      │
│   you a magic link.                    │
│                                        │
│   ┌────────────────────────────────┐   │
│   │  email@example.com             │   │
│   └────────────────────────────────┘   │
│                                        │
│   ┌────────────────────────────────┐   │
│   │       Send magic link          │   │
│   └────────────────────────────────┘   │
│                                        │
│                                        │
│   By using this app you consent to     │
│   anonymized session data being used   │
│   for equine welfare research.         │
│                                        │
└────────────────────────────────────────┘
```

## "Magic link sent" screen

```
┌────────────────────────────────────────┐
│                                        │
│              📬                        │
│                                        │
│   We've sent a magic link to:          │
│                                        │
│   anna@chc-horses.ch                   │
│                                        │
│   Open the email and tap the link to   │
│   log in. The link works once and      │
│   expires in 1 hour.                   │
│                                        │
│   Didn't get it?                       │
│   [ Try a different email ]            │
│   [ Resend the link ]                  │
│                                        │
│                                        │
│   ⓘ iPhone users — known V.0 friction  │
│   The magic link will open in Safari,  │
│   which doesn't support Bluetooth.     │
│   To finish logging in:                │
│                                        │
│   1. Tap the link in your email        │
│   2. When Safari opens with the        │
│      "logged in" page, copy the URL    │
│      from the address bar              │
│   3. Open Bluefy                       │
│   4. Paste the URL and go              │
│                                        │
│   You'll only need to do this once     │
│   per device. We're fixing this in     │
│   V.0.1.                               │
│                                        │
└────────────────────────────────────────┘
```

## First-time provisioning

When the magic link is consumed and the rider is new:

1. Supabase creates `auth.users` row
2. AuthCallback page sees no `rider_profiles` row exists for this user
3. Shows brief "Almost done" screen asking for display name
4. Submit calls `POST /api/auth/provision-rider { display_name }`
5. Server creates `rider_profiles` row, sets `is_admin = ADMIN_EMAILS.includes(email)`
6. Redirect to `/home`

## Subsequent visits

Cookie-based session check on every page load. If valid:
- `/` redirects to `/home`
- All `/admin/*` routes check `is_admin = true`, redirect to `/home` if not
- All `/(rider)/*` routes accessible

If session expired:
- Redirect to `/` with toast "Your session expired, please log in again"

## Logout flow

In `/home` settings menu:
- "Log out" button → `supabase.auth.signOut()` → redirect to `/`

## API endpoints used

```typescript
POST /api/auth/magic-link
  body: { email: string }
  response: { sent: true } | { error: string }

POST /api/auth/provision-rider
  body: { display_name: string }
  auth: requires logged-in user (cookie)
  response: { rider_profile: RiderProfile }
```

## Integration test

```typescript
// tests/e2e/onboarding.spec.ts

test('new rider can sign in with magic link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Welcome.')).toBeVisible();
  
  await page.getByLabel('email').fill('test@lafattoria.dev');
  await page.getByRole('button', { name: 'Send magic link' }).click();
  
  await expect(page).toHaveURL('/auth/sent');
  await expect(page.getByText('test@lafattoria.dev')).toBeVisible();
  
  // Simulate clicking the magic link (using test-mode token from Supabase)
  const testToken = await getTestMagicLinkToken('test@lafattoria.dev');
  await page.goto(`/auth/callback?token=${testToken}`);
  
  // First time → asks for display name
  await page.getByLabel('display name').fill('Test Rider');
  await page.getByRole('button', { name: 'Continue' }).click();
  
  await expect(page).toHaveURL('/home');
});

test('returning rider skips provisioning', async ({ page }) => {
  await loginAs('existing@lafattoria.dev', page);
  await page.goto('/');
  await expect(page).toHaveURL('/home');
});
```

## Failure modes

| Failure | Response |
|---|---|
| Invalid email format | Inline error, button disabled |
| Email send fails (Supabase down) | Toast "Couldn't send link, try again" |
| Magic link expired | Auth/error page with "Request a new link" |
| Magic link reused | Same as expired |
| Rider profile creation fails | Auth/error with retry, log to Sentry |
| Network offline | "Check your connection" inline message |

## Design notes

- Email input has `inputMode="email"`, `autoComplete="email"`
- Privacy/consent line is intentionally above the fold
- No "Sign up" vs "Log in" distinction — magic link handles both transparently

## Known V.0 limitation: iPhone onboarding friction

iPhone is a second-class platform in V.0 and we own this explicitly rather than hand-waving it.

### The problem

Apple's Safari does not support Web Bluetooth and Apple has not signaled they will. The only iPhone path to Web Bluetooth is **Bluefy**, a third-party browser from PNN Soft that polyfills Web Bluetooth via WKWebView.

When a rider on iPhone:
1. Opens `lafattoria.app` in Bluefy ✓
2. Enters their email → magic link sent ✓
3. Receives the email in Mail (or Gmail app) ✓
4. Taps the magic link →
   - **iOS opens it in Safari, the system default browser, NOT in Bluefy**
5. Safari validates the token and the rider is logged in — but Safari has no Bluetooth, so any subsequent attempt to pair a band fails
6. To actually use the app, the rider must manually copy the URL and paste it into Bluefy

This is friction. It's also unavoidable in V.0 without testing Bluefy's URL scheme support, which we haven't done yet.

### V.0 mitigation

The "Magic link sent" screen above includes explicit instructions for iPhone users. They follow steps 1–4, see Safari say "logged in," copy the URL from the address bar, paste into Bluefy, done.

Cookie-based session persists 90 days, so this happens **once per device**, not once per session.

### What we are NOT doing in V.0

- ❌ Custom URL scheme (`bluefy://...`) in the email — would work in principle but requires testing Bluefy's exact scheme format on device first
- ❌ Apple Universal Links / App Site Association — would require Bluefy team to declare our domain in their app's AASA, which is not under our control
- ❌ Native iOS app — V.1+ at the earliest
- ❌ Hand-waving — we acknowledge this friction in onboarding instead of pretending it doesn't exist

### V.0.1 plan

After the band arrives and the system is validated on yourself:

1. Test Bluefy's custom URL scheme support (per PNN Soft docs, Bluefy supports custom URL schemes that let any iOS app open a web page directly inside Bluefy)
2. If it works: update the magic link email to include both an HTTPS link (for Android/desktop) and a `bluefy://` style link for iPhone
3. If it doesn't work or notification streaming on iPhone is unreliable: commit to Android-first explicitly and document iPhone as unsupported in V.0

### Known unknowns to test on first iPhone trial

- Whether Bluefy's BLE notifications are reliable in current build (a 2023 GitHub issue reported notifications failing on iPad; resolution unverified)
- Whether the exact custom URL scheme format works as documented
- Whether passive HR streaming stays alive when phone screen is locked
- Whether cookies persist across Safari → Bluefy paste flow

These tests happen during the smoke test on day 1; document findings and decide on V.0.1 path based on results.

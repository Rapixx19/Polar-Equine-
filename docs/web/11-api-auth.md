# web/11 · API Auth Endpoints

## Feature scope

Magic-link authentication endpoints.

## Depends on

- `03-auth-and-permissions.md`

## Endpoints

### `POST /api/auth/magic-link`

Send a magic link to an email.

**Body:** `{ email: string }`
**Response:** `{ sent: true }` or `{ error: string }`

Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`.

### `POST /api/auth/provision-rider`

Create the `rider_profiles` row for a newly-authed user.

**Body:** `{ display_name: string }`
**Auth:** Supabase user cookie (already authed)
**Response:** `{ rider_profile: RiderProfile }`

Server checks if email matches `ADMIN_EMAILS` and sets `is_admin = true` accordingly.

### `POST /api/auth/logout`

Sign out, clear cookies.

**Response:** `{ ok: true }`

## Files

```
app/api/auth/magic-link/route.ts          ← ≤ 80 lines
app/api/auth/provision-rider/route.ts     ← ≤ 100 lines
app/api/auth/logout/route.ts              ← ≤ 50 lines
lib/auth/server.ts                         ← server-side auth helpers (≤ 100 lines)
tests/integration/auth.test.ts
```

## Implementation sketch

```typescript
// app/api/auth/magic-link/route.ts

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json());
  if (!body.success) return validationError(body.error);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: body.data.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    }
  });

  if (error) {
    console.error('Magic link send failed', error);
    return NextResponse.json({ error: 'Couldn\'t send link' }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
```

```typescript
// app/api/auth/provision-rider/route.ts

const Body = z.object({ display_name: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return unauthorized();

  const body = Body.safeParse(await req.json());
  if (!body.success) return validationError(body.error);

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim());
  const is_admin = adminEmails.includes(user.email!);

  // Upsert rider profile
  const { data, error } = await supabase.from('rider_profiles').upsert({
    id: user.id,
    display_name: body.data.display_name,
    is_admin,
  }).select().single();

  if (error) return serverError(error);
  return NextResponse.json({ rider_profile: data });
}
```

## Integration test

```typescript
test('full magic-link flow', async () => {
  // 1. Request magic link
  const send = await fetch('/api/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email: 'test@lafattoria.dev' }),
  });
  expect(send.status).toBe(200);

  // 2. Simulate clicking the link (test mode)
  const cookie = await testGetMagicLinkCookie('test@lafattoria.dev');

  // 3. Provision rider profile
  const provision = await fetch('/api/auth/provision-rider', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ display_name: 'Test Rider' }),
  });
  expect(provision.status).toBe(200);
  const { rider_profile } = await provision.json();
  expect(rider_profile.display_name).toBe('Test Rider');

  // 4. Subsequent authed request works
  const me = await fetch('/api/me', { headers: { Cookie: cookie } });
  expect(me.status).toBe(200);
});
```

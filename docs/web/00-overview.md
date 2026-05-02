# web/00 · `lafattoria-web` Repo Overview

## What this repo is

The Next.js + TypeScript monorepo containing:
- The PWA (rider-facing)
- The admin dashboard
- All API routes
- The Web Bluetooth integration with Polar H10

Deployed to Vercel as a single application. Domain: `lafattoria.app`.

## Folder structure

```
lafattoria-web/
├── app/                              ← Next.js App Router
│   ├── (auth)/                       ← unauthenticated routes
│   │   ├── page.tsx                  ← welcome / sign-in
│   │   └── auth/callback/page.tsx    ← magic link callback
│   │
│   ├── (rider)/                      ← rider-only routes (PWA)
│   │   ├── home/page.tsx             ← activity-type picker
│   │   ├── start/
│   │   │   ├── horse/page.tsx
│   │   │   ├── band/page.tsx
│   │   │   └── ready/page.tsx
│   │   └── session/[id]/
│   │       ├── page.tsx              ← recording screen
│   │       └── review/page.tsx       ← post-session label review
│   │
│   ├── admin/                        ← admin routes
│   │   ├── page.tsx                  ← Today
│   │   ├── horses/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── sessions/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── bands/page.tsx
│   │
│   └── api/                          ← API routes
│       ├── auth/
│       │   ├── magic-link/route.ts
│       │   └── provision-rider/route.ts
│       ├── ingest/
│       │   └── samples/route.ts
│       ├── sessions/
│       │   ├── route.ts              ← POST=start, GET=list
│       │   └── [id]/
│       │       ├── route.ts          ← GET, PATCH=end, DELETE
│       │       ├── review/route.ts   ← GET review data
│       │       └── labels/route.ts   ← POST replace labels
│       ├── horses/route.ts
│       ├── bands/route.ts
│       └── cron/                     ← scheduled job endpoints
│           ├── compute-runner/route.ts   ← runs queued compute jobs (every 1 min)
│           └── abandon-stale/route.ts    ← auto-abandons stale active sessions (every 6h)
│
├── components/                       ← shared React components
│   ├── ui/                           ← shadcn primitives
│   ├── charts/
│   ├── timeline/                     ← gait timeline editor
│   ├── ble/                          ← Web Bluetooth components
│   └── layout/
│
├── lib/                              ← utility modules
│   ├── supabase/                     ← Supabase client wrappers
│   │   ├── client.ts                 ← browser client
│   │   ├── server.ts                 ← server-side client
│   │   └── service-role.ts           ← admin / algo-bypass client
│   ├── ble/                          ← Web Bluetooth core
│   │   ├── index.ts                  ← public API
│   │   ├── polar-h10.ts              ← H10-specific
│   │   ├── pmd-codec.ts              ← PMD frame decoder
│   │   ├── hr-service.ts             ← HR profile reader
│   │   └── batcher.ts                ← sample batching for upload
│   ├── auth/
│   │   ├── magic-link.ts
│   │   └── permissions.ts
│   ├── api-client.ts                 ← fetch wrapper for our own API
│   └── types.ts                      ← shared TypeScript types
│
├── public/
│   ├── manifest.json                 ← PWA manifest
│   ├── sw.js                         ← service worker
│   ├── icon-192.png
│   ├── icon-512.png
│   └── logo.svg                      ← when supplied
│
├── supabase/
│   └── migrations/                   ← see 02-database-schema.md
│
├── tests/
│   ├── e2e/                          ← Playwright
│   └── unit/                         ← Vitest
│
├── .cursorrules                      ← 150-line file limit
├── .env.local                        ← never committed
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Conventions

### File naming
- React components: `PascalCase.tsx`
- Utility modules: `kebab-case.ts`
- Routes: lowercase, App Router conventions

### Imports
- Absolute via `@/`
- Order: external libs → `@/` → relative

### TypeScript
- Strict mode on
- No `any` — use `unknown` and narrow
- Explicit types on all public function signatures
- Discriminated unions for state machines

### Server vs client components
- **Default to server components**
- Add `'use client'` only when needed (interactivity, hooks, browser APIs)
- BLE code is always client-side
- Forms with submit handlers usually client-side
- Display-only screens are server components

### Styling
- Tailwind utility classes
- No custom CSS files except `globals.css`
- shadcn/ui components copied into `components/ui/` (not via npm)

### Testing
- Every API route has at least one integration test
- Every BLE module function has unit tests
- Critical user flows have Playwright E2E tests

## Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
ADMIN_EMAILS=admin1@example.com,admin2@example.com

# Algo service
ALGO_SERVICE_URL=https://algo.lafattoria.app
ALGO_BEARER_TOKEN=...

# Branding
NEXT_PUBLIC_APP_NAME=La Fattoria

# Vercel
NEXT_PUBLIC_VERCEL_URL=lafattoria.app
```

## Linked feature specs

| File | Feature |
|---|---|
| 01-pwa-onboarding.md | Magic-link login + rider profile |
| 02-pwa-session-flow.md | Start/record/end session screens |
| 03-pwa-band-pairing.md | Web Bluetooth integration |
| 04-pwa-label-review.md | Post-session label approval |
| 05-admin-today.md | Admin "Today" screen |
| 06-admin-horses.md | Horses list + detail |
| 07-admin-sessions.md | Sessions list + detail |
| 08-admin-bands.md | Bands management |
| 09-api-ingest.md | `/api/ingest/*` endpoints |
| 10-api-sessions.md | `/api/sessions/*` endpoints |
| 11-api-auth.md | `/api/auth/*` endpoints |
| 12-realtime-channels.md | Supabase Realtime subscriptions |
| 13-testing-strategy.md | Test conventions, fixtures |

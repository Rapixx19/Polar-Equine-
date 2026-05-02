# web/13 · Testing Strategy

## Test pyramid

```
            E2E tests (Playwright)         ← 6–10 tests
            ─────────────────────
              Integration tests             ← per API route, per feature
            ─────────────────────
              Unit tests                    ← per utility module
```

## Tooling

- **Vitest** for unit and integration tests
- **MSW** (Mock Service Worker) for mocking external HTTP (e.g. algo service)
- **Playwright** for end-to-end tests
- **Supabase test database** for integration tests (separate Supabase project, env-switched)

## Test directories

```
tests/
├── unit/                          ← pure functions, no I/O
│   ├── ble/
│   │   └── pmd-codec.test.ts
│   ├── labels/
│   │   └── timeline-ops.test.ts
│   └── auth/
│       └── magic-link.test.ts
│
├── integration/                   ← hits a real test DB and test algo
│   ├── auth.test.ts
│   ├── ingest.test.ts
│   ├── sessions.test.ts
│   └── realtime.test.ts
│
└── e2e/                           ← full browser, mocked BLE
    ├── onboarding.spec.ts
    ├── session-flow.spec.ts
    ├── label-review.spec.ts
    ├── ble-pairing.spec.ts
    ├── admin-today.spec.ts
    ├── admin-sessions.spec.ts
    └── admin-horses.spec.ts
```

## Mocking BLE in E2E

`navigator.bluetooth` doesn't exist in Playwright by default. Inject a mock:

```typescript
// tests/e2e/helpers/mock-ble.ts

export async function setupMockBLE(page: Page) {
  await page.addInitScript(() => {
    (window as any).__mockBLE = createMockBluetooth();
    Object.defineProperty(navigator, 'bluetooth', {
      get: () => (window as any).__mockBLE,
    });
  });
  
  return {
    async simulatePolarH10Stream(opts: { duration_s: number }) { ... },
    async userSelectsDevice(name: string) { ... },
  };
}
```

## Test data fixtures

```
tests/fixtures/
├── horses.json                    ← seed horses for tests
├── riders.json                    ← seed riders
├── sample-session.parquet         ← realistic 50-min recording
└── auto-labels.json               ← expected algo output
```

## Pre-commit hooks

`.husky/pre-commit`:
```
npm run typecheck
npm run lint
npm run test:unit
```

CI runs full suite (unit + integration + e2e).

## Coverage targets

- **Unit:** 80% lines
- **Integration:** every API route has at least one test
- **E2E:** 6 critical user journeys covered

Don't chase 100%. Cover the things that would silently break.

## Running tests

```bash
npm run test                # all unit + integration
npm run test:unit           # vitest unit only
npm run test:integration    # vitest integration only (requires test DB)
npm run test:e2e            # playwright
npm run test:watch          # vitest in watch mode
```

## Test environment

`.env.test`:
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321        # local supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALGO_SERVICE_URL=http://localhost:9999                  # MSW intercepts
KIOSK_PIN=0000
ADMIN_PASSWORD=test
```

## Continuous integration

`.github/workflows/test.yml`:
- Triggered on every push and PR
- Spins up Supabase via `npx supabase start`
- Runs unit + integration in parallel
- Runs E2E in serial (BLE mocking is stateful)
- Posts coverage report to PR comment

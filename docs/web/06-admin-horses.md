# web/06 · Admin Horses

## Feature scope

Manage horses in the system: list, add, edit, view detail with trends.

## Depends on

- `03-auth-and-permissions.md`

## Public interface

| Route | Component |
|---|---|
| `/admin/horses` | `HorsesListScreen` |
| `/admin/horses/[id]` | `HorseDetailScreen` |

## Files

```
app/admin/horses/page.tsx                ← ≤ 100 lines
app/admin/horses/[id]/page.tsx           ← ≤ 130 lines
components/admin/HorseCard.tsx           ← ≤ 80 lines
components/admin/HorseForm.tsx           ← ≤ 120 lines
components/admin/RiderPermissions.tsx    ← ≤ 100 lines
components/charts/WorkloadTrend.tsx      ← ≤ 100 lines
components/charts/RestingHRTrend.tsx     ← ≤ 100 lines
components/charts/RMSSDTrend.tsx         ← ≤ 100 lines
lib/admin/horse-data.ts                  ← ≤ 100 lines
tests/e2e/admin-horses.spec.ts
```

## Horses list

Grid of horse cards. Each card:
- Name, breed, age
- Status badge (good/watch)
- Last session timestamp
- Sessions count

Plus "+ Add horse" button → opens dialog with form.

## Horse detail

```
HIPPO · KWPN gelding · 11y                [ Edit ]

  Last 30 days at a glance
  ──────────────────────────
  Sessions:       18
  Active hours:   14h 22m
  Avg session HR: 94 bpm
  Resting HR:     32 bpm (stable)
  RMSSD median:   142 ms (rising slightly)

  [── workload trend, 30d ──]
  [── resting HR trend, 30d ──]
  [── RMSSD trend, 30d ──]

  Authorized riders
  ──────────────────────────
  ▪ Anna       rider     [×]
  ▪ Steve      trainer   [×]
  ▪ Gianluca   trainer   [×]
  + Add rider

  Recent sessions
  ──────────────────────────
  Today 09:00  Riding    50 min  87/156
  Yesterday    Walker    30 min  ...
  [more]
```

## Add / edit horse form

Fields:
- Name (required)
- Breed (text)
- Date of birth (date picker)
- Sex (mare/gelding/stallion)
- Owner (text)
- Photo (file upload to Supabase Storage)
- Notes (textarea)

## Rider permissions component

Manages `horse_riders` table for this horse. Search rider by email or name, add with role (rider/trainer/owner), remove with confirmation.

## Integration test

```typescript
test('admin adds a new horse', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/horses');
  
  await page.getByRole('button', { name: '+ Add horse' }).click();
  await page.getByLabel('Name').fill('Test Horse');
  await page.getByLabel('Breed').fill('Hanoverian');
  await page.selectOption('select[name=sex]', 'gelding');
  await page.getByRole('button', { name: 'Save' }).click();
  
  await expect(page.getByText('Test Horse')).toBeVisible();
});
```

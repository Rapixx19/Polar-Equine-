# web/08 · Admin Bands

## Feature scope

Manage Polar H10 bands paired to the system. Auto-discover new bands when riders pair them, allow admin to nickname and remove.

## Depends on

- `web/03-pwa-band-pairing.md` (when riders pair, bands appear here)

## Public interface

| Route | Component |
|---|---|
| `/admin/bands` | `BandsListScreen` |

## Files

```
app/admin/bands/page.tsx           ← ≤ 100 lines
components/admin/BandsList.tsx      ← ≤ 100 lines
components/admin/BandRow.tsx        ← ≤ 80 lines
components/admin/RenameBandDialog.tsx ← ≤ 60 lines
lib/admin/band-data.ts              ← ≤ 80 lines
tests/e2e/admin-bands.spec.ts
```

## Screen

Table:

| Nickname | MAC | Model | Last seen | Status | Sessions |

Each row:
- Click nickname → rename dialog
- "Online" badge if active session uses this band
- Battery percentage if last reading is recent
- "Remove" button (soft-delete; sessions stay)

When a rider pairs a previously-unknown band, an entry auto-appears here with placeholder nickname like "Polar H10 ABCD" — admin can rename to "Band 1".

## Auto-discovery flow

```typescript
// triggered when /api/bands receives a POST from PWA pairing
// if mac_address is new:
INSERT INTO bands (mac_address, nickname, model)
VALUES ($1, 'Polar H10 ' || RIGHT($1, 4), 'Polar H10')
ON CONFLICT (mac_address) DO UPDATE SET last_seen = now();
```

Admin sees the new entry with an "Unnamed" badge until they rename it.

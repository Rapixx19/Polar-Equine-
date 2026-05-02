# web/03 · PWA Band Pairing (Web Bluetooth)

## Feature scope

The Web Bluetooth integration that connects the PWA to a Polar H10 / Polar Equine sensor and streams its data to the API.

## Depends on

- `web/02-pwa-session-flow.md` (calling context)
- `web/09-api-ingest.md` (where samples go)

## Public interface

```typescript
// lib/ble/index.ts

export type PairedBand = {
  device_id: string;          // browser-generated stable ID
  mac_address: string;         // when available, else the BLE address
  name: string;                // 'Polar H10 ABCD'
  paired_at: Date;
  last_connected: Date | null;
};

export type SampleStream = {
  hr$: Observable<HRSample>;
  acc$: Observable<AccSample>;
  ecg$: Observable<EcgSample>;
  battery$: Observable<number>;
  connection$: Observable<ConnectionState>;
};

export async function pairBand(): Promise<PairedBand>;
export async function connectBand(band: PairedBand): Promise<SampleStream>;
export async function disconnectBand(band: PairedBand): Promise<void>;
export function getKnownBands(): PairedBand[];
```

Calling code in `02-pwa-session-flow.md` uses this interface only — never reaches into the BLE protocol details.

## Files in this feature

```
lib/ble/index.ts                    ← public API (≤ 80 lines)
lib/ble/polar-h10.ts                ← H10-specific connection logic (≤ 130 lines)
lib/ble/hr-service.ts               ← Standard HR profile (UUID 0x180D) (≤ 100 lines)
lib/ble/pmd-service.ts              ← Polar PMD service (≤ 130 lines)
lib/ble/pmd-codec.ts                ← Binary frame decoder (≤ 150 lines)
lib/ble/batcher.ts                  ← 2-second sample batching (≤ 100 lines)
lib/ble/storage.ts                  ← IndexedDB for paired-band metadata (≤ 80 lines)
components/ble/PairButton.tsx        ← Triggers browser BT picker (≤ 60 lines)
components/ble/ConnectionStatus.tsx  ← Live connection indicator (≤ 80 lines)
tests/unit/ble/pmd-codec.test.ts     ← Unit tests for decoder
tests/e2e/ble-pairing.spec.ts        ← Mocked BLE E2E
```

## Polar H10 protocol summary

The H10 exposes two BLE services:

### 1. Heart Rate Service (standard, UUID `0x180D`)

- Characteristic `0x2A37` "Heart Rate Measurement"
- Notify-only
- Format: 1 byte flags + 1 or 2 bytes HR + 0..N pairs of R-R intervals (uint16 LE, units of 1/1024 s)
- Update rate: ~1 Hz

### 2. Polar Measurement Data (PMD) Service (proprietary)

UUIDs (from polar-ble-sdk):
```
PMD Service:        FB005C80-02E7-F387-1CAD-8ACD2D8DF0C8
PMD Control Point:  FB005C81-02E7-F387-1CAD-8ACD2D8DF0C8  (write+notify)
PMD Data:           FB005C82-02E7-F387-1CAD-8ACD2D8DF0C8  (notify)
```

To start a stream, write a "Start Measurement" command to the control point.

#### Start ECG (130 Hz, 14-bit)

```
Bytes: 0x02 0x00 0x00 0x01 0x82 0x00 0x01 0x01 0x0E 0x00
```

#### Start ACC (52 Hz, ±8g, 16-bit)

```
Bytes: 0x02 0x02 0x00 0x01 0x34 0x00 0x01 0x01 0x10 0x00 0x02 0x01 0x08 0x00
```

These exact byte sequences are pulled from the official Polar BLE SDK Kotlin/Swift sources. **Don't invent them.**

## PMD frame format

Each notification on the data characteristic:

```
Byte 0:        Stream type (0x00 = ECG, 0x02 = ACC)
Bytes 1–8:     Timestamp (uint64 LE, nanoseconds since boot)
Byte 9:        Frame type (0x00 = full samples, 0x80 = delta-encoded)
Bytes 10–end:  Payload (varies by stream type and frame type)
```

ECG payload (frame type 0x00):
- 3 bytes per sample, signed 24-bit microvolts (LE)
- ~73 samples per notification at 130 Hz

ACC payload (frame type 0x80):
- Reference sample (3 × int16 LE = 6 bytes)
- Delta-encoded samples (variable bit-width per the spec)
- ~36 samples per notification at 52 Hz

Implement the decoder in `pmd-codec.ts` per the official spec PDF in the polar-ble-sdk repo.

## Pairing flow

```typescript
// lib/ble/index.ts

export async function pairBand(): Promise<PairedBand> {
  // 1. Web Bluetooth opens native picker, filtering by Polar HR Service
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }],
    optionalServices: [POLAR_PMD_SERVICE_UUID, BATTERY_SERVICE_UUID],
  });

  // 2. Connect briefly to verify it's a Polar device
  const server = await device.gatt!.connect();
  const hr = await server.getPrimaryService('heart_rate');
  // confirm we can subscribe
  
  // 3. Persist the device.id (browser-stable) in IndexedDB
  const band: PairedBand = {
    device_id: device.id,
    mac_address: device.id, // browser doesn't expose real MAC; use device.id
    name: device.name ?? 'Polar H10',
    paired_at: new Date(),
    last_connected: null,
  };
  await storage.savePairedBand(band);
  
  // 4. POST to backend so it appears in admin Bands list
  await api.post('/api/bands', {
    mac_address: band.mac_address,
    nickname: band.name,
  });

  return band;
}
```

## Streaming flow

```typescript
export async function connectBand(band: PairedBand): Promise<SampleStream> {
  // 1. Use getDevices() to find the previously paired device
  const devices = await navigator.bluetooth.getDevices();
  const device = devices.find(d => d.id === band.device_id);
  if (!device) throw new BandNotFoundError();

  // 2. Connect GATT
  const server = await device.gatt!.connect();
  
  // 3. Subscribe HR
  const hr$ = await subscribeHR(server);
  
  // 4. Enable PMD streams
  await enablePMDStream(server, 'ecg');
  await enablePMDStream(server, 'acc');
  
  // 5. Subscribe PMD data
  const pmd$ = await subscribePMDData(server);
  const acc$ = pmd$.filter(f => f.type === 'acc').map(decodeAccFrame);
  const ecg$ = pmd$.filter(f => f.type === 'ecg').map(decodeEcgFrame);
  
  // 6. Connection state
  const connection$ = new BehaviorSubject<ConnectionState>('connected');
  device.addEventListener('gattserverdisconnected', () => {
    connection$.next('disconnected');
    setTimeout(() => attemptReconnect(device, connection$), 2000);
  });

  return { hr$, acc$, ecg$, battery$: ..., connection$ };
}
```

## Batching for upload

`lib/ble/batcher.ts`:

```typescript
class Batcher {
  private buf = { hr: [], acc: [], ecg: [] };
  private flushTimer: number | null = null;

  add(stream: 'hr' | 'acc' | 'ecg', sample: any) {
    this.buf[stream].push(sample);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 2000);
    }
  }

  private async flush() {
    if (this.allEmpty()) return;
    const payload = { ...this.buf };
    this.buf = { hr: [], acc: [], ecg: [] };
    this.flushTimer = null;
    
    try {
      await api.post(`/api/ingest/samples`, {
        session_id: this.session_id,
        samples: payload,
      });
    } catch (err) {
      // Queue to IndexedDB for offline replay
      await storage.queueBatch(this.session_id, payload);
    }
  }
}
```

## Offline buffering

If the upload to `/api/ingest/samples` fails (network drop), the batch is written to IndexedDB. A background watcher retries every 5 seconds while the session is recording.

### Quota awareness (iOS-specific concern)

iOS Safari/Bluefy enforce a ~50 MB IndexedDB quota per origin. At ~10 MB raw data per 50-minute session, an iPhone rider with poor wifi could fill IndexedDB silently in a few sessions and start losing samples with no warning. Android Chrome's quota is much higher (~6% of disk), so this is iOS-specific.

The batcher checks IndexedDB quota before queuing offline:

```typescript
// lib/ble/storage.ts

export async function queueBatch(session_id: string, payload: SampleBatch) {
  const estimate = await navigator.storage.estimate();
  const usedMB = (estimate.usage ?? 0) / (1024 * 1024);
  const quotaMB = (estimate.quota ?? 50 * 1024 * 1024) / (1024 * 1024);
  
  // Trigger warning at 80% usage
  if (usedMB / quotaMB > 0.8) {
    surfaceWarning('OFFLINE_BUFFER_FULL', { usedMB, quotaMB });
  }
  
  // Hard stop at 90% — refuse to queue, surface error
  if (usedMB / quotaMB > 0.9) {
    throw new BufferFullError(`IndexedDB at ${(usedMB/quotaMB*100).toFixed(0)}% — buffer cannot accept more samples. Reconnect to wifi to upload pending data.`);
  }
  
  // Otherwise queue normally
  await db.batches.add({ session_id, payload, queued_at: Date.now() });
}
```

The PWA recording screen shows the offline buffer status when queue depth is non-trivial:

```
⚠ Offline — buffering 12.4 MB / 50 MB
  4 batches queued, retrying every 5s
```

If the buffer hits 80%, the rider sees a more urgent banner suggesting they end the session or move to wifi range. At 90%, the PWA refuses to accept new samples and surfaces a hard error rather than silently dropping data.

This is critical for research data integrity: silent loss is unacceptable.

### What's NOT in V.0

- ❌ Compression of buffered samples (would extend the wall but adds complexity)
- ❌ Chunking large queues to Supabase Storage when buffer fills (V.1 enhancement)
- ❌ Background sync via Service Worker periodic sync (Apple doesn't support it on iOS)

In V.0, the strategy is: warn early, stop queuing before silent loss, recover on reconnect. See `V1_BACKLOG.md` for compression and Storage chunking work.

## Reconnect handling

Web Bluetooth disconnects happen often (out of range, browser tab paused, OS Bluetooth state). Strategy:

1. On `gattserverdisconnected`, set `connection$` to `disconnected`
2. Wait 2 seconds, attempt `device.gatt!.connect()`
3. On success: re-subscribe HR + re-enable PMD streams + re-subscribe PMD data
4. On failure: backoff, retry every 5 seconds for up to 5 minutes
5. After 5 minutes: give up, show "Reconnect manually" button

## Browser compatibility

| Browser | Status |
|---|---|
| Chrome (Android) | ✓ Full Web Bluetooth support |
| Edge / Brave (Android) | ✓ Full support |
| Firefox (any) | ✗ No Web Bluetooth |
| Safari (iPhone) | ✗ Not supported by Apple |
| **Bluefy (iPhone)** | ✓ Polyfill works |
| Chrome (Desktop) | ✓ For testing |

PWA detects `'bluetooth' in navigator` and shows installation guide if missing.

## Integration test

```typescript
// tests/e2e/ble-pairing.spec.ts

test('user pairs a Polar H10 and starts streaming', async ({ page, mockBLE }) => {
  await loginAs('test@lafattoria.dev', page);
  await mockBLE.advertiseDevice({ name: 'Polar H10 ABCD', services: ['heart_rate'] });
  
  await page.goto('/start/band');
  await page.getByRole('button', { name: 'Pair a new band' }).click();
  
  // Mock browser BT picker selects our device
  await mockBLE.userSelectsDevice('Polar H10 ABCD');
  
  await expect(page.getByText('Polar H10 ABCD')).toBeVisible();
  await expect(page.getByText('Available')).toBeVisible();
});

// Unit test for the codec
test('decodes Polar ACC delta frame correctly', () => {
  const frame = new Uint8Array([0x02, /* timestamp 8 bytes */ ..., 0x80, /* ref + deltas */ ...]);
  const samples = decodeAccFrame(frame);
  expect(samples).toHaveLength(36);
  expect(samples[0].ax).toBeCloseTo(/* known value */);
});
```

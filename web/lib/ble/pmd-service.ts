// Polar PMD service wrapper — subscribes to the proprietary PMD data
// characteristic and dispatches decoded frames upstream. Browser-only.
//
// The HR service runs in parallel via subscribeHR (lib/ble/connection.ts);
// this module is independent so it can be unwired in one line if the codec
// proves wrong on horse data (kill switch per Slice 12 spec).

import { decodePmdFrame } from "./pmd-codec";
import type { AccSample, EcgSample } from "./pmd-types";
import {
  PMD_CONTROL_POINT_UUID,
  PMD_DATA_UUID,
  PMD_SERVICE_UUID,
  PMD_START_ACC,
  PMD_START_ECG,
} from "./pmd-types";

export type PmdHandlers = {
  onAccBatch: (samples: AccSample[]) => void;
  onEcgBatch: (samples: EcgSample[]) => void;
  // Per Rule 9: surface decode failures rather than silently dropping.
  onDecodeError?: (info: { byteLength: number; reason: string }) => void;
  // Pre-decode hook for the inspector — receives a hex preview of the first
  // bytes so the operator can sanity-check the wire format before trusting
  // the decoder. Production callers omit this; cost is zero when undefined.
  onRawFrame?: (info: { byteLength: number; hexPreview: string }) => void;
};

function hexPreview(view: DataView, max = 16): string {
  const n = Math.min(view.byteLength, max);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(view.getUint8(i).toString(16).padStart(2, "0"));
  return parts.join(" ") + (view.byteLength > max ? ` …+${view.byteLength - max}b` : "");
}

// Anchors the H10's monotonic boot clock to wall-clock on the first frame.
// Subsequent frames inherit the same offset so a 5-min session has a coherent
// timeline even if Date.now() drifts.
type ClockAnchor = { firstPmdNs: bigint; firstWallMs: number };

export async function startPmdStreams(
  server: BluetoothRemoteGATTServer,
  handlers: PmdHandlers,
): Promise<() => Promise<void>> {
  const service = await server.getPrimaryService(PMD_SERVICE_UUID);
  const control = await service.getCharacteristic(PMD_CONTROL_POINT_UUID);
  const data = await service.getCharacteristic(PMD_DATA_UUID);

  // Control point must be subscribed for notify responses (start-stream
  // acknowledgement) per spec. We don't act on the acks here, but the H10
  // requires the subscription before it will honour writes.
  await control.startNotifications();
  // Isolate per-stream writes: if the H10 rejects one config (e.g. an
  // unsupported sample rate), we still want the other stream to come up.
  // Earlier versions awaited both in sequence so a single GATT error tanked
  // both — observed live 2026-05-14 when 52 Hz ACC was rejected.
  let accStarted = false;
  let ecgStarted = false;
  try {
    await control.writeValue(PMD_START_ACC.buffer as ArrayBuffer);
    accStarted = true;
  } catch (err) {
    console.error("[pmd] acc_start_failed", err);
  }
  try {
    await control.writeValue(PMD_START_ECG.buffer as ArrayBuffer);
    ecgStarted = true;
  } catch (err) {
    console.error("[pmd] ecg_start_failed", err);
  }
  if (!accStarted && !ecgStarted) {
    throw new Error("pmd_start_failed_both_streams");
  }

  const anchor: ClockAnchor = { firstPmdNs: BigInt(0), firstWallMs: 0 };
  let anchored = false;

  const handle = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (!value) return;
    handlers.onRawFrame?.({ byteLength: value.byteLength, hexPreview: hexPreview(value) });
    let frame;
    try {
      frame = decodePmdFrame(value);
    } catch (err) {
      handlers.onDecodeError?.({ byteLength: value.byteLength, reason: String(err) });
      return;
    }
    if (!frame) {
      handlers.onDecodeError?.({ byteLength: value.byteLength, reason: "unrecognised_frame" });
      return;
    }

    const wallMs = Date.now();
    if (!anchored) {
      anchor.firstPmdNs = frame.pmd_ns;
      anchor.firstWallMs = wallMs;
      anchored = true;
    }
    const baseTms = anchor.firstWallMs + Number(frame.pmd_ns - anchor.firstPmdNs) / 1_000_000;
    // Samples within one notification are simultaneous from PMD's perspective;
    // spread them across the inter-sample interval so DB timestamps are unique
    // and ordered. 200 Hz ACC → 5 ms apart; 130 Hz ECG → ~7.7 ms.
    const period = frame.type === "acc" ? 1000 / 200 : 1000 / 130;

    if (frame.type === "acc") {
      const out: AccSample[] = frame.samples.map((s, i) => ({
        t_ms: Math.round(baseTms + i * period),
        ax_mg: s.ax_mg,
        ay_mg: s.ay_mg,
        az_mg: s.az_mg,
      }));
      handlers.onAccBatch(out);
    } else {
      const out: EcgSample[] = frame.samples.map((s, i) => ({
        t_ms: Math.round(baseTms + i * period),
        uv: s.uv,
      }));
      handlers.onEcgBatch(out);
    }
  };

  data.addEventListener("characteristicvaluechanged", handle);
  await data.startNotifications();

  let stopped = false;
  return async () => {
    if (stopped) return;
    stopped = true;
    data.removeEventListener("characteristicvaluechanged", handle);
    try {
      await data.stopNotifications();
    } catch (err) {
      console.warn("[pmd] data stopNotifications failed", err);
    }
    // Best-effort stop writes (0x03 + stream type). H10 will also stop
    // streaming on GATT disconnect; failures here are non-fatal.
    try {
      await control.writeValue(new Uint8Array([0x03, 0x02]).buffer as ArrayBuffer);
      await control.writeValue(new Uint8Array([0x03, 0x00]).buffer as ArrayBuffer);
    } catch (err) {
      console.warn("[pmd] stop-stream write failed", err);
    }
    try {
      await control.stopNotifications();
    } catch (err) {
      console.warn("[pmd] control stopNotifications failed", err);
    }
  };
}

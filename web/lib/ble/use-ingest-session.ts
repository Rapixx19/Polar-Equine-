"use client";

import { useCallback, useRef, useState } from "react";

import { HRBatcher } from "@/lib/ble/batcher";
import type { HRSample } from "@/lib/ble/hr-codec";
import type { ActivityType, RidingSubtype } from "@/lib/activities";
import { classifyStartError, startErrorMessage } from "@/lib/ble/start-error";
import { decodeAccFrame } from "@/lib/ble/acc-codec";
import { decodeEcgFrame } from "@/lib/ble/ecg-codec";
import {
  MEAS_TYPE_ACC,
  MEAS_TYPE_ECG,
  encodeStartAcc,
  encodeStartEcg,
  type MeasType,
} from "@/lib/ble/pmd-protocol";
import { startPmdStream, type PmdStreamCloser } from "@/lib/ble/pmd-session";
import { SignalBatcher } from "@/lib/ble/signal-batcher";

export type IngestState = "off" | "starting" | "recording" | "stopping" | "error";

export type StartOptions = {
  ridingSubtype?: RidingSubtype | null;
  activityNote?: string | null;
  // When provided, ACC + ECG PMD streams are started silently alongside HR.
  // Stream-start failures retry once then continue HR-only; the rider is
  // never blocked by PMD problems.
  pmdServer?: BluetoothRemoteGATTServer | null;
};

// PMD ACC stream config — locked to 200 Hz / 16-bit / ±8 G per slice 13.A.
const ACC_RATE_HZ = 200;
const ACC_RANGE_G = 8;
const ACC_RES_BITS = 16;
// PMD ECG stream config — locked to 130 Hz / 14-bit per slice 13.E.
const ECG_RATE_HZ = 130;
const ECG_RES_BITS = 14;

export function useIngestSession() {
  const [state, setState] = useState<IngestState>("off");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flushedCount, setFlushedCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const batcherRef = useRef<HRBatcher | null>(null);
  const accBatcherRef = useRef<SignalBatcher | null>(null);
  const ecgBatcherRef = useRef<SignalBatcher | null>(null);
  const accCloserRef = useRef<PmdStreamCloser | null>(null);
  const ecgCloserRef = useRef<PmdStreamCloser | null>(null);
  const sessionStartedAtRef = useRef<number>(0);
  // Mirror sessionId in a ref so stop() can read it without a stale-closure
  // re-render dependency. Same idea as the unsubscribeRef pattern in BleTestPanel.
  const sessionIdRef = useRef<string | null>(null);

  const start = useCallback(
    async (horseId: string, activityType: ActivityType, options: StartOptions = {}) => {
    if (batcherRef.current) return;
    setState("starting");
    setError(null);
    setFlushedCount(0);
    setDroppedCount(0);
    const clientSessionId = crypto.randomUUID();
    const ridingFamily = activityType === "riding" || activityType === "lunging";
    const body: Record<string, unknown> = {
      horse_id: horseId,
      activity_type: activityType,
      client_session_id: clientSessionId,
    };
    if (ridingFamily && options.ridingSubtype) {
      body.riding_subtype = options.ridingSubtype;
    }
    if (activityType === "other" && options.activityNote) {
      body.activity_note = options.activityNote;
    }
    let res: Response;
    try {
      res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError(startErrorMessage(classifyStartError(null, null)));
      setState("error");
      return;
    }
    if (!res.ok) {
      // Best-effort to read the API's error code; if the body isn't JSON we
      // still classify by status alone so the rider sees a useful message.
      const errCode = await res
        .clone()
        .json()
        .then((j: unknown) => (j as { error?: string } | null)?.error ?? null)
        .catch(() => null);
      setError(startErrorMessage(classifyStartError(res.status, errCode)));
      setState("error");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    sessionIdRef.current = id;
    sessionStartedAtRef.current = Date.now();
    setSessionId(id);
    const batcher = new HRBatcher(id, {
      onFlushed: (n) => setFlushedCount((c) => c + n),
      onDropped: (n) => {
        setDroppedCount((c) => c + n);
        setError("Some samples failed to upload.");
      },
    });
    batcher.start();
    batcherRef.current = batcher;
    setState("recording");

    // Best-effort PMD streams. Failures are silent — HR session keeps going.
    if (options.pmdServer) {
      void attachPmdStreams(
        options.pmdServer,
        id,
        sessionStartedAtRef,
        accBatcherRef,
        ecgBatcherRef,
        accCloserRef,
        ecgCloserRef,
      );
    }
    },
    [],
  );

  const stop = useCallback(async () => {
    if (!batcherRef.current && !sessionIdRef.current) return;
    setState("stopping");

    // Drain PMD streams in parallel with HR. Each closer writes its PMD STOP
    // command and unsubscribes; the batcher flushes any partial final chunk.
    const accCloser = accCloserRef.current;
    const ecgCloser = ecgCloserRef.current;
    const accBatcher = accBatcherRef.current;
    const ecgBatcher = ecgBatcherRef.current;
    accCloserRef.current = null;
    ecgCloserRef.current = null;
    accBatcherRef.current = null;
    ecgBatcherRef.current = null;
    const pmdShutdown = Promise.all([
      accCloser?.().catch((err) => console.warn("[ingest] acc closer failed", err)),
      ecgCloser?.().catch((err) => console.warn("[ingest] ecg closer failed", err)),
    ]).then(() =>
      Promise.all([
        accBatcher?.stop().catch((err) => console.warn("[ingest] acc batcher stop failed", err)),
        ecgBatcher?.stop().catch((err) => console.warn("[ingest] ecg batcher stop failed", err)),
      ]),
    );

    const batcher = batcherRef.current;
    batcherRef.current = null;
    if (batcher) await batcher.stop();
    await pmdShutdown;

    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      }).catch(() => {
        // Session-end failure is non-fatal: samples already landed; the
        // session row just stays 'active' until reaped or manually ended.
      });
    }
    setSessionId(null);
    setState("off");
  }, []);

  const onSample = useCallback((s: HRSample) => {
    batcherRef.current?.add(s);
  }, []);

  return { state, sessionId, flushedCount, droppedCount, error, start, stop, onSample };
}

// Attach ACC + ECG streams independently. Each stream:
//   1. Builds a SignalBatcher (registers chunks every 30s)
//   2. Starts the PMD stream with one retry on initial failure
//   3. On final failure, logs + drops the batcher silently
// Returns when both streams have been attempted (running or given up).
async function attachPmdStreams(
  server: BluetoothRemoteGATTServer,
  sessionId: string,
  sessionStartedAtRef: React.MutableRefObject<number>,
  accBatcherRef: React.MutableRefObject<SignalBatcher | null>,
  ecgBatcherRef: React.MutableRefObject<SignalBatcher | null>,
  accCloserRef: React.MutableRefObject<PmdStreamCloser | null>,
  ecgCloserRef: React.MutableRefObject<PmdStreamCloser | null>,
): Promise<void> {
  const accBatcher = new SignalBatcher(
    sessionId,
    "acc",
    { sample_rate_hz: ACC_RATE_HZ, resolution_bits: ACC_RES_BITS, range_g: ACC_RANGE_G, channels: 3 },
    {
      onUploaded: (bytes, chunkIndex) =>
        console.log(`[signal:acc] uploaded chunk=${chunkIndex} bytes=${bytes}`),
      onDropped: (bytes, reason) =>
        console.warn(`[signal:acc] dropped bytes=${bytes} reason=${reason}`),
    },
  );
  accBatcher.start();
  accBatcherRef.current = accBatcher;

  const ecgBatcher = new SignalBatcher(
    sessionId,
    "ecg",
    { sample_rate_hz: ECG_RATE_HZ, resolution_bits: ECG_RES_BITS, channels: 1 },
    {
      onUploaded: (bytes, chunkIndex) =>
        console.log(`[signal:ecg] uploaded chunk=${chunkIndex} bytes=${bytes}`),
      onDropped: (bytes, reason) =>
        console.warn(`[signal:ecg] dropped bytes=${bytes} reason=${reason}`),
    },
  );
  ecgBatcher.start();
  ecgBatcherRef.current = ecgBatcher;

  const accStart = startStreamWithOneRetry({
    measType: MEAS_TYPE_ACC,
    startBytes: encodeStartAcc({ rate_hz: ACC_RATE_HZ, range_g: ACC_RANGE_G, resolution_bits: ACC_RES_BITS }),
    server,
    onFrame: (view) => {
      try {
        const frame = decodeAccFrame(view);
        const tMs = Date.now() - sessionStartedAtRef.current;
        accBatcherRef.current?.addSamples(tMs, frame.samples);
      } catch (err) {
        console.error("[ingest] acc frame decode failed", err);
      }
    },
  });

  const ecgStart = startStreamWithOneRetry({
    measType: MEAS_TYPE_ECG,
    startBytes: encodeStartEcg({ rate_hz: ECG_RATE_HZ, resolution_bits: ECG_RES_BITS }),
    server,
    onFrame: (view) => {
      try {
        const frame = decodeEcgFrame(view);
        const tMs = Date.now() - sessionStartedAtRef.current;
        ecgBatcherRef.current?.addSamples(tMs, frame.samples);
      } catch (err) {
        console.error("[ingest] ecg frame decode failed", err);
      }
    },
  });

  const [accCloser, ecgCloser] = await Promise.all([accStart, ecgStart]);
  if (accCloser) {
    accCloserRef.current = accCloser;
  } else {
    // Drop the batcher silently; no data will be pushed into it.
    accBatcherRef.current = null;
    void accBatcher.stop().catch(() => {});
  }
  if (ecgCloser) {
    ecgCloserRef.current = ecgCloser;
  } else {
    ecgBatcherRef.current = null;
    void ecgBatcher.stop().catch(() => {});
  }
}

type StartStreamArgs = {
  measType: MeasType;
  startBytes: Uint8Array;
  server: BluetoothRemoteGATTServer;
  onFrame: (view: DataView) => void;
};

async function startStreamWithOneRetry(args: StartStreamArgs): Promise<PmdStreamCloser | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await startPmdStream(args.server, { measType: args.measType, startBytes: args.startBytes }, args.onFrame);
    } catch (err) {
      console.warn(
        `[ingest] pmd start failed (measType=0x${args.measType.toString(16)}, attempt=${attempt + 1})`,
        err,
      );
    }
  }
  return null;
}

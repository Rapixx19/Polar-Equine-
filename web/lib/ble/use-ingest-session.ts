"use client";

import { useCallback, useRef, useState } from "react";

import { HRBatcher } from "@/lib/ble/batcher";
import { ACCBatcher } from "@/lib/ble/acc-batcher";
import { ECGBatcher } from "@/lib/ble/ecg-batcher";
import type { HRSample } from "@/lib/ble/hr-codec";
import { startPmdStreams, type PmdLifecycleEvent } from "@/lib/ble/pmd-service";
import type { ActivityType, RidingSubtype } from "@/lib/activities";
import { classifyStartError, startErrorMessage } from "@/lib/ble/start-error";

export type IngestState = "off" | "starting" | "recording" | "stopping" | "error";

export type StartOptions = {
  ridingSubtype?: RidingSubtype | null;
  activityNote?: string | null;
  hasPrototypeMount?: boolean;
  // When provided, Slice 12 streams ACC + ECG via PMD alongside HR. When null,
  // HR-only fallback (e.g. devices that don't expose PMD, or before Slice 12
  // shipped). Kill-switch: pass null to disable PMD without code revert.
  bleServer?: BluetoothRemoteGATTServer | null;
};

export type StreamStat = { count: number; lastAt: number | null };
export type StreamStats = { hr: StreamStat; acc: StreamStat; ecg: StreamStat };

const EMPTY_STREAM_STATS: StreamStats = {
  hr: { count: 0, lastAt: null },
  acc: { count: 0, lastAt: null },
  ecg: { count: 0, lastAt: null },
};

export function useIngestSession() {
  const [state, setState] = useState<IngestState>("off");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flushedCount, setFlushedCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<StreamStats>(EMPTY_STREAM_STATS);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pmdEnabled, setPmdEnabled] = useState(false);
  // Tagged + timestamped lifecycle entries from startPmdStreams so the UI can
  // show exactly what failed (service blocked, ACC rejected by H10, etc.)
  // without forcing the rider into DevTools. Capped at 20 entries.
  const [pmdEvents, setPmdEvents] = useState<
    Array<PmdLifecycleEvent & { at: number }>
  >([]);
  const hrBatcherRef = useRef<HRBatcher | null>(null);
  const accBatcherRef = useRef<ACCBatcher | null>(null);
  const ecgBatcherRef = useRef<ECGBatcher | null>(null);
  const pmdUnsubRef = useRef<(() => Promise<void>) | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const start = useCallback(
    async (horseId: string, activityType: ActivityType, options: StartOptions = {}) => {
    if (hrBatcherRef.current) return;
    setState("starting");
    setError(null);
    setFlushedCount(0);
    setDroppedCount(0);
    setStreams(EMPTY_STREAM_STATS);
    setStartedAt(null);
    setPmdEnabled(Boolean(options.bleServer));
    setPmdEvents([]);
    const clientSessionId = crypto.randomUUID();
    const ridingFamily = activityType === "riding" || activityType === "lunging";
    const body: Record<string, unknown> = {
      horse_id: horseId,
      activity_type: activityType,
      client_session_id: clientSessionId,
    };
    if (ridingFamily && options.ridingSubtype) body.riding_subtype = options.ridingSubtype;
    if (activityType === "other" && options.activityNote) body.activity_note = options.activityNote;
    if (options.hasPrototypeMount) body.has_prototype_mount = true;
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
    setSessionId(id);
    const events = {
      onFlushed: (n: number) => setFlushedCount((c) => c + n),
      onDropped: (n: number) => {
        setDroppedCount((c) => c + n);
        setError("Some samples failed to upload.");
      },
    };
    const hr = new HRBatcher(id, events);
    hr.start();
    hrBatcherRef.current = hr;

    if (options.bleServer) {
      const acc = new ACCBatcher(id, events);
      const ecg = new ECGBatcher(id, events);
      acc.start();
      ecg.start();
      accBatcherRef.current = acc;
      ecgBatcherRef.current = ecg;
      try {
        pmdUnsubRef.current = await startPmdStreams(options.bleServer, {
          onAccBatch: (b) => {
            acc.add(b);
            if (b.length > 0) {
              const lastAt = Date.now();
              setStreams((s) => ({ ...s, acc: { count: s.acc.count + b.length, lastAt } }));
            }
          },
          onEcgBatch: (b) => {
            ecg.add(b);
            if (b.length > 0) {
              const lastAt = Date.now();
              setStreams((s) => ({ ...s, ecg: { count: s.ecg.count + b.length, lastAt } }));
            }
          },
          onDecodeError: (info) => console.warn("[pmd] decode_error", info),
          onPmdEvent: (event) => {
            setPmdEvents((prev) =>
              [...prev, { ...event, at: Date.now() }].slice(-20),
            );
          },
        });
      } catch (err) {
        // PMD start failure must not abort the HR session — HR remains the
        // critical stream. Log loudly so we notice on horse-test day.
        console.error("[pmd] start_failed", err);
        setError("ACC/ECG stream failed to start; HR is still recording.");
      }
    }
    setStartedAt(Date.now());
    setState("recording");
    },
    [],
  );

  const stop = useCallback(async () => {
    if (!hrBatcherRef.current && !sessionIdRef.current) return;
    setState("stopping");
    const pmdUnsub = pmdUnsubRef.current;
    pmdUnsubRef.current = null;
    if (pmdUnsub) await pmdUnsub().catch((e) => console.warn("[pmd] stop_failed", e));
    const hr = hrBatcherRef.current;
    const acc = accBatcherRef.current;
    const ecg = ecgBatcherRef.current;
    hrBatcherRef.current = null;
    accBatcherRef.current = null;
    ecgBatcherRef.current = null;
    await Promise.all([hr?.stop(), acc?.stop(), ecg?.stop()].filter(Boolean) as Promise<void>[]);
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      }).catch(() => {});
    }
    setSessionId(null);
    setState("off");
  }, []);

  const onSample = useCallback((s: HRSample) => {
    hrBatcherRef.current?.add(s);
    if (hrBatcherRef.current) {
      const lastAt = Date.now();
      setStreams((prev) => ({ ...prev, hr: { count: prev.hr.count + 1, lastAt } }));
    }
  }, []);

  return {
    state,
    sessionId,
    flushedCount,
    droppedCount,
    error,
    streams,
    startedAt,
    pmdEnabled,
    pmdEvents,
    start,
    stop,
    onSample,
  };
}

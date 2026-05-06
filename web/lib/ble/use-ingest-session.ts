"use client";

import { useCallback, useRef, useState } from "react";

import { HRBatcher } from "@/lib/ble/batcher";
import type { HRSample } from "@/lib/ble/hr-codec";
import type { ActivityType, RidingSubtype } from "@/lib/activities";

export type IngestState = "off" | "starting" | "recording" | "stopping" | "error";

export type StartOptions = {
  ridingSubtype?: RidingSubtype | null;
  activityNote?: string | null;
};

export function useIngestSession() {
  const [state, setState] = useState<IngestState>("off");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flushedCount, setFlushedCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const batcherRef = useRef<HRBatcher | null>(null);
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
      setError("Couldn't start session.");
      setState("error");
      return;
    }
    if (!res.ok) {
      setError("Couldn't start session.");
      setState("error");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    sessionIdRef.current = id;
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
    },
    [],
  );

  const stop = useCallback(async () => {
    if (!batcherRef.current && !sessionIdRef.current) return;
    setState("stopping");
    const batcher = batcherRef.current;
    batcherRef.current = null;
    if (batcher) await batcher.stop();
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

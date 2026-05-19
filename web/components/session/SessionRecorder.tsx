"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CaptureQualityBadge } from "@/components/ble/CaptureQualityBadge";
import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import { PreSessionGuard } from "@/components/recording/PreSessionGuard";
import { LiveLabelChips } from "@/components/session/LiveLabelChips";
import { LiveVitals } from "@/components/session/LiveVitals";
import { PrototypeMountToggle } from "@/components/session/PrototypeMountToggle";
import { RecorderButtons } from "@/components/session/RecorderButtons";
import { SessionContextChip } from "@/components/session/SessionContextChip";
import { SignalQualityBanner } from "@/components/session/SignalQualityBanner";
import {
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";
import { subscribeHR, type ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";
import { useIngestSession } from "@/lib/ble/use-ingest-session";
import { useQualityEvents } from "@/lib/quality/use-quality-events";
import { useCaptureSession } from "@/lib/ui/use-capture-session";

type Props = {
  horse: { id: string; name: string };
  activity: ActivityType;
  ridingSubtype?: RidingSubtype | null;
  activityNote?: string | null;
};

// A heartbeat older than this means flow has stopped — the strap is dry,
// loose, or off. H10 sends one HR frame per second so 5 s is comfortably
// past any single-sample skip.
const HR_FLOW_BUDGET_MS = 5000;

// Auto-reconnect backoff. Emma's 2026-05-15 ride lost 25 % of its wall
// clock to three GATT disconnects — the strap stayed on, the rider kept
// riding, but the browser dropped the link and never tried again. The
// schedule below covers the typical "horse trotted out of range, then
// back" case (~5–10 s) while keeping the early retries cheap so a brief
// blip recovers near-instantly.
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000] as const;

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SessionRecorder({ horse, activity, ridingSubtype = null, activityNote = null }: Props) {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [hasPrototypeMount, setHasPrototypeMount] = useState(false);
  // Last HR frame timestamp from the strap (not the GATT link). Used to
  // distinguish "GATT linked" from "actually receiving heartbeats" — these
  // come apart when contact is dry or the OS reports a ghost pairing, in
  // which case the band shows "Connected" but no frames are arriving.
  const [hrLastAt, setHrLastAt] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const nowTick = useNowTick(500);
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  // Aborts the in-flight reconnect loop when the rider taps End or the
  // page unmounts. Loop checks `aborted` between each backoff sleep.
  const reconnectAbortRef = useRef<{ aborted: boolean } | null>(null);
  const reconnectingRef = useRef(false);
  // Mirror ingest.sessionId so the post-stop redirect still has a target
  // after stop() clears it. Never null this ref once set.
  const sessionIdRef = useRef<string | null>(null);

  const ingest = useIngestSession();
  // `onDisconnect` is captured by subscribeHR at pair-time, before the
  // session is recording or PMD is enabled. We need to read the *current*
  // ingest state when a disconnect fires later, not the snapshot from
  // pair-time. A ref kept fresh each commit does that without re-binding
  // the BLE listener (which would orphan the prior subscription). Updated
  // inside an effect rather than during render to satisfy the
  // react-hooks/refs rule.
  const ingestRef = useRef(ingest);
  useEffect(() => {
    ingestRef.current = ingest;
  });
  const captureQuality = useCaptureSession({
    active: ingest.state === "recording",
    sessionId: ingest.sessionId,
    latestSample: sample,
  });
  useQualityEvents({
    active: ingest.state === "recording",
    sessionId: ingest.sessionId,
    startedAt: ingest.startedAt,
    state: captureQuality.state,
  });

  useEffect(() => {
    if (ingest.sessionId) sessionIdRef.current = ingest.sessionId;
  }, [ingest.sessionId]);

  useEffect(() => {
    return () => {
      if (reconnectAbortRef.current) reconnectAbortRef.current.aborted = true;
      void unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  function onSample(s: HRSample) {
    setSample(s);
    setHrLastAt(Date.now());
    ingestRef.current.onSample(s);
  }

  function handlePairingStateChange(next: ConnectionState) {
    setConnectionState(next);
    // A fresh pair attempt invalidates whatever flow we'd seen before.
    if (next === "pairing" || next === "disconnected") setHrLastAt(null);
  }

  function onDisconnect() {
    setConnectionState("disconnected");
    unsubscribeRef.current = null;
    setHrLastAt(null);
    // Auto-reconnect only while a recording is in flight; outside a
    // recording the rider is in the pair/connect phase and should drive
    // re-pairing themselves. Re-entrancy guarded by reconnectingRef:
    // subscribeHR's disconnect listener can fire again mid-loop when an
    // attempt's GATT handshake gets torn down by the next disconnect.
    if (ingestRef.current.state !== "recording") return;
    if (!deviceRef.current) return;
    if (reconnectingRef.current) return;
    void runReconnectLoop();
  }

  async function runReconnectLoop() {
    const device = deviceRef.current;
    if (!device || !device.gatt) return;
    reconnectingRef.current = true;
    reconnectAbortRef.current = { aborted: false };
    const abort = reconnectAbortRef.current;
    try {
      for (let i = 0; i < RECONNECT_BACKOFF_MS.length; i++) {
        if (abort.aborted) return;
        setReconnectAttempt(i + 1);
        await sleep(RECONNECT_BACKOFF_MS[i]);
        if (abort.aborted) return;
        try {
          const server = await device.gatt.connect();
          if (abort.aborted) return;
          const unsubscribe = await subscribeHR(device, server, onSample, onDisconnect);
          if (abort.aborted) {
            await unsubscribe().catch(() => {});
            return;
          }
          unsubscribeRef.current = unsubscribe;
          serverRef.current = server;
          setConnectionState("connected");
          setErrorMessage(undefined);
          if (ingestRef.current.pmdEnabled) {
            await ingestRef.current.reattach(server);
          }
          return;
        } catch (err) {
          console.warn("[ble] reconnect_attempt_failed", { attempt: i + 1, err });
        }
      }
      // Exhausted attempts — fall back to the manual reconnect banner.
    } finally {
      reconnectingRef.current = false;
      setReconnectAttempt(0);
    }
  }

  function onConnected(
    device: BluetoothDevice,
    server: BluetoothRemoteGATTServer,
    unsubscribe: () => Promise<void>,
  ) {
    setDeviceName(device.name ?? "Polar H10");
    unsubscribeRef.current = unsubscribe;
    serverRef.current = server;
    deviceRef.current = device;
    setErrorMessage(undefined);
  }

  async function handleEnd() {
    if (reconnectAbortRef.current) reconnectAbortRef.current.aborted = true;
    setReconnectAttempt(0);
    await ingestRef.current.stop();
    const id = sessionIdRef.current;
    if (id) router.push(`/session/${id}/saved`);
  }

  const isRecording = ingest.state === "recording";
  const isStopping = ingest.state === "stopping";
  const isReconnecting = reconnectAttempt > 0;
  const showDisconnectBanner =
    isRecording && connectionState === "disconnected" && !isReconnecting;
  const hrFlowing = useMemo(
    () => hrLastAt !== null && nowTick - hrLastAt < HR_FLOW_BUDGET_MS,
    [hrLastAt, nowTick],
  );
  const gattLinkedButNoHr =
    connectionState === "connected" && !hrFlowing && ingest.state === "off";
  // Allow retry from the "error" state — start() short-circuits on an active
  // batcher, so re-tapping when state==="error" cleanly re-attempts the POST.
  // **Critical**: require an actual HR frame in addition to GATT-connected.
  // A GATT-linked-but-not-flowing band can happen with dry contacts, the
  // strap off, or an OS ghost pairing — the UI used to lie "Connected"
  // and let Start fire, producing an empty session.
  const startDisabled =
    connectionState !== "connected" ||
    !hrFlowing ||
    (ingest.state !== "off" && ingest.state !== "error");

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-light">Recording for {horse.name}</h1>
        <div className="mt-2">
          <SessionContextChip
            activity={activity}
            ridingSubtype={ridingSubtype}
            activityNote={activityNote}
          />
        </div>
      </div>

      <UnsupportedBanner />
      <PreSessionGuard />

      {!isRecording && !isStopping && (
        <p className="text-sm text-[var(--text-muted)]">
          Strap the band on the girth, wet the contact patches, then pair and tap Start.
        </p>
      )}

      {!isRecording && !isStopping && (
        <PrototypeMountToggle
          checked={hasPrototypeMount}
          onChange={setHasPrototypeMount}
        />
      )}

      <PairButton
        state={connectionState}
        onStateChange={handlePairingStateChange}
        onConnected={onConnected}
        onSample={onSample}
        onDisconnect={onDisconnect}
        onError={setErrorMessage}
      />

      {!isRecording && !isStopping && (
        <ConnectionStatus
          state={connectionState}
          sample={sample}
          deviceName={deviceName}
          errorMessage={errorMessage}
        />
      )}

      {gattLinkedButNoHr && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"
        >
          <span aria-hidden>⏳</span>
          <span>
            <strong>Waiting for first heartbeat…</strong>{" "}
            The band is paired but no HR frames are arriving. Wet the contact patches,
            make sure the strap is snug, and that it&apos;s positioned over the heart.
          </span>
        </div>
      )}

      {connectionState === "connected" && hrFlowing && !isRecording && !isStopping && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-[var(--lime)]/40 bg-[var(--lime)]/10 p-3 text-sm text-[var(--lime)]"
        >
          <span aria-hidden>♥</span>
          <span>
            <strong>Receiving heartbeats</strong> — ready to record.
          </span>
        </div>
      )}

      {(isRecording || isStopping) && (
        <>
          <SignalQualityBanner state={captureQuality.state} />
          <LiveVitals
            sample={sample}
            streams={ingest.streams}
            startedAt={ingest.startedAt}
            pmdEnabled={ingest.pmdEnabled}
            pmdEvents={ingest.pmdEvents}
          />
          <CaptureQualityBadge
            state={captureQuality.state}
            goodPct={captureQuality.summary.goodPct}
          />
          <LiveLabelChips
            sessionId={ingest.sessionId}
            startedAt={ingest.startedAt}
          />
          <p
            role="note"
            className="text-center text-xs text-amber-300/80"
          >
            Keep this screen open. Switching apps or locking can drop the connection.
          </p>
        </>
      )}

      {isRecording && isReconnecting && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700"
        >
          ⏳ Connection lost — reconnecting to the band… (attempt {reconnectAttempt}/
          {RECONNECT_BACKOFF_MS.length})
        </div>
      )}

      {showDisconnectBanner && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          ⚠ Connection lost. Reconnect the band, or tap End to save what we have.
        </div>
      )}

      <RecorderButtons
        state={ingest.state}
        startDisabled={startDisabled}
        onStart={() =>
          void ingest.start(horse.id, activity, {
            ridingSubtype,
            activityNote,
            hasPrototypeMount,
            bleServer: serverRef.current,
          })
        }
        onEnd={() => void handleEnd()}
      />

      {ingest.error && (
        <div
          role="alert"
          className="rounded-md border border-[var(--red)] bg-[var(--red)]/10 p-3 text-sm text-[var(--red)]"
        >
          {ingest.error}
        </div>
      )}
    </div>
  );
}

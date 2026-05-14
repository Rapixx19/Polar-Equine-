"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CaptureQualityBadge } from "@/components/ble/CaptureQualityBadge";
import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import { PreSessionGuard } from "@/components/recording/PreSessionGuard";
import { LiveVitals } from "@/components/session/LiveVitals";
import { RecorderButtons } from "@/components/session/RecorderButtons";
import { SessionContextChip } from "@/components/session/SessionContextChip";
import {
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";
import type { ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";
import { useIngestSession } from "@/lib/ble/use-ingest-session";
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

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SessionRecorder({ horse, activity, ridingSubtype = null, activityNote = null }: Props) {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  // Last HR frame timestamp from the strap (not the GATT link). Used to
  // distinguish "GATT linked" from "actually receiving heartbeats" — these
  // come apart when contact is dry or the OS reports a ghost pairing, in
  // which case the band shows "Connected" but no frames are arriving.
  const [hrLastAt, setHrLastAt] = useState<number | null>(null);
  const nowTick = useNowTick(500);
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  // Mirror ingest.sessionId so the post-stop redirect still has a target
  // after stop() clears it. Never null this ref once set.
  const sessionIdRef = useRef<string | null>(null);

  const ingest = useIngestSession();
  const captureQuality = useCaptureSession({
    active: ingest.state === "recording",
    sessionId: ingest.sessionId,
    latestSample: sample,
  });

  useEffect(() => {
    if (ingest.sessionId) sessionIdRef.current = ingest.sessionId;
  }, [ingest.sessionId]);

  useEffect(() => {
    return () => {
      void unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  function onSample(s: HRSample) {
    setSample(s);
    setHrLastAt(Date.now());
    ingest.onSample(s);
  }

  function handlePairingStateChange(next: ConnectionState) {
    setConnectionState(next);
    // A fresh pair attempt invalidates whatever flow we'd seen before.
    if (next === "pairing" || next === "disconnected") setHrLastAt(null);
  }

  function onDisconnect() {
    setConnectionState("disconnected");
    unsubscribeRef.current = null;
    // Slice 7 deviates from BleTestPanel: do NOT auto-stop on disconnect.
    // Surface a "Reconnect or End" banner; rider chooses whether the run
    // is salvageable. (Slice 18 makes reconnect automatic.)
  }

  function onConnected(
    device: BluetoothDevice,
    server: BluetoothRemoteGATTServer,
    unsubscribe: () => Promise<void>,
  ) {
    setDeviceName(device.name ?? "Polar H10");
    unsubscribeRef.current = unsubscribe;
    serverRef.current = server;
    setErrorMessage(undefined);
  }

  async function handleEnd() {
    await ingest.stop();
    const id = sessionIdRef.current;
    if (id) router.push(`/session/${id}/saved`);
  }

  const isRecording = ingest.state === "recording";
  const isStopping = ingest.state === "stopping";
  const showDisconnectBanner = isRecording && connectionState === "disconnected";
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
        </>
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

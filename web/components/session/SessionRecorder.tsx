"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CaptureQualityBadge } from "@/components/ble/CaptureQualityBadge";
import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import { PreSessionGuard } from "@/components/recording/PreSessionGuard";
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

export function SessionRecorder({ horse, activity, ridingSubtype = null, activityNote = null }: Props) {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
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
    ingest.onSample(s);
  }

  function onDisconnect() {
    setConnectionState("disconnected");
    unsubscribeRef.current = null;
    // Slice 7 deviates from BleTestPanel: do NOT auto-stop on disconnect.
    // Surface a "Reconnect or End" banner; rider chooses whether the run
    // is salvageable. (Slice 18 makes reconnect automatic.)
  }

  function onConnected(device: BluetoothDevice, unsubscribe: () => Promise<void>) {
    setDeviceName(device.name ?? "Polar H10");
    unsubscribeRef.current = unsubscribe;
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
  const startDisabled =
    connectionState !== "connected" || ingest.state !== "off";

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
        onStateChange={setConnectionState}
        onConnected={onConnected}
        onSample={onSample}
        onDisconnect={onDisconnect}
        onError={setErrorMessage}
      />

      <ConnectionStatus
        state={connectionState}
        sample={sample}
        deviceName={deviceName}
        errorMessage={errorMessage}
      />

      {(isRecording || isStopping) && (
        <CaptureQualityBadge
          state={captureQuality.state}
          goodPct={captureQuality.summary.goodPct}
        />
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
          })
        }
        onEnd={() => void handleEnd()}
      />

      {ingest.error && <p className="text-xs text-[var(--red)]">{ingest.error}</p>}
    </div>
  );
}

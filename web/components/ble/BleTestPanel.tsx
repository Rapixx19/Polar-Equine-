"use client";

import { useEffect, useRef, useState } from "react";

import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { RecordingControls } from "@/components/ble/RecordingControls";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import type { ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";
import { useIngestSession } from "@/lib/ble/use-ingest-session";

const COUNTER_WINDOW_MS = 2000;

type HorseOption = { id: string; name: string };

type Props = {
  horses: HorseOption[];
};

export function BleTestPanel({ horses }: Props) {
  const [state, setState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [horseId, setHorseId] = useState<string>(horses[0]?.id ?? "");
  const [activityType, setActivityType] = useState<ActivityType>("riding");
  // Held in a ref, not state: setState((fn) => ...) treats fn as a lazy initializer
  // and silently invokes it instead of storing the unsubscribe handle.
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
  // Packet-rate + dropout counter — cheap instrumentation now, painful to retrofit
  // on a moving horse where you can't tell band drop vs. BLE drop vs. decode skip.
  // lastTick=0 means "not yet primed"; first sample seeds it without logging.
  const counters = useRef({ count: 0, lastTick: 0, drops: 0 });

  // useIngestSession's start/stop/onSample are stable (useCallback []); calling
  // ingest.onSample is a no-op until ingest.start has primed the batcher, so
  // we don't need to gate on state here.
  const ingest = useIngestSession();

  useEffect(() => {
    return () => {
      void unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  function onSample(s: HRSample) {
    console.log("[hr]", s);
    setSample(s);
    ingest.onSample(s);
    counters.current.count++;
    const now = Date.now();
    if (counters.current.lastTick === 0) {
      counters.current.lastTick = now;
      return;
    }
    const elapsed = now - counters.current.lastTick;
    if (elapsed >= COUNTER_WINDOW_MS) {
      const hz = (counters.current.count * 1000) / elapsed;
      console.log(
        `[hr-rate] ${hz.toFixed(2)} Hz over ${(elapsed / 1000).toFixed(1)}s, drops=${counters.current.drops}`,
      );
      counters.current.count = 0;
      counters.current.lastTick = now;
    }
  }

  function onDisconnect() {
    setState("disconnected");
    unsubscribeRef.current = null;
    counters.current.drops++;
    // If a recording was running, drain and end it. We don't auto-reconnect
    // (Slice 18) — surfacing the dropout is intentional. ingest.stop is a
    // no-op when nothing is recording.
    void ingest.stop();
  }

  function onConnected(device: BluetoothDevice, unsubscribe: () => Promise<void>) {
    setDeviceName(device.name ?? "Polar H10");
    unsubscribeRef.current = unsubscribe;
    setErrorMessage(undefined);
  }

  async function onManualDisconnect() {
    await ingest.stop();
    const fn = unsubscribeRef.current;
    unsubscribeRef.current = null;
    if (fn) await fn();
    setState("disconnected");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-light">BLE smoke test</h1>
        <p className="mt-1 text-sm text-stone-500">
          Pair a Polar H10 and watch live HR + R-R intervals. Console logs every beat.
        </p>
      </div>

      <UnsupportedBanner />

      <PairButton
        state={state}
        onStateChange={setState}
        onConnected={onConnected}
        onSample={onSample}
        onDisconnect={onDisconnect}
        onError={setErrorMessage}
      />

      <ConnectionStatus
        state={state}
        sample={sample}
        deviceName={deviceName}
        errorMessage={errorMessage}
        onDisconnect={onManualDisconnect}
      />

      <RecordingControls
        connectionState={state}
        horses={horses}
        horseId={horseId}
        onHorseChange={setHorseId}
        activityType={activityType}
        onActivityChange={setActivityType}
        activityOptions={ACTIVITY_TYPES}
        ingestState={ingest.state}
        flushedCount={ingest.flushedCount}
        droppedCount={ingest.droppedCount}
        ingestError={ingest.error}
        onStart={() => void ingest.start(horseId, activityType)}
        onStop={() => void ingest.stop()}
      />
    </div>
  );
}

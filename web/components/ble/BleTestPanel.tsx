"use client";

import { useEffect, useRef, useState } from "react";

import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import type { ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";

const COUNTER_WINDOW_MS = 2000;

export function BleTestPanel() {
  const [state, setState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  // Held in a ref, not state: setState((fn) => ...) treats fn as a lazy initializer
  // and silently invokes it instead of storing the unsubscribe handle.
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
  // Packet-rate + dropout counter — cheap instrumentation now, painful to retrofit
  // on a moving horse where you can't tell band drop vs. BLE drop vs. decode skip.
  // lastTick=0 means "not yet primed"; first sample seeds it without logging.
  const counters = useRef({ count: 0, lastTick: 0, drops: 0 });

  useEffect(() => {
    return () => {
      void unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  function onSample(s: HRSample) {
    console.log("[hr]", s);
    setSample(s);
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
  }

  function onConnected(device: BluetoothDevice, unsubscribe: () => Promise<void>) {
    setDeviceName(device.name ?? "Polar H10");
    unsubscribeRef.current = unsubscribe;
    setErrorMessage(undefined);
  }

  async function onManualDisconnect() {
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
    </div>
  );
}

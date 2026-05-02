"use client";

import { useEffect, useRef, useState } from "react";

import { ConnectionStatus } from "@/components/ble/ConnectionStatus";
import { PairButton } from "@/components/ble/PairButton";
import { UnsupportedBanner } from "@/components/ble/UnsupportedBanner";
import type { ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";

export function BleTestPanel() {
  const [state, setState] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>();
  const [sample, setSample] = useState<HRSample | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  // Held in a ref, not state: setState((fn) => ...) treats fn as a lazy initializer
  // and silently invokes it instead of storing the unsubscribe handle.
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => {
      void unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  function onSample(s: HRSample) {
    console.log("[hr]", s);
    setSample(s);
  }

  function onDisconnect() {
    setState("disconnected");
    unsubscribeRef.current = null;
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

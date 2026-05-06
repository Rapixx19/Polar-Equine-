"use client";

import { useState } from "react";

import { pairAndConnect, subscribeHR, type ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";

type Props = {
  state: ConnectionState;
  onStateChange: (state: ConnectionState) => void;
  onConnected: (device: BluetoothDevice, unsubscribe: () => Promise<void>) => void;
  onSample: (sample: HRSample) => void;
  onDisconnect: () => void;
  onError: (message: string) => void;
};

export function PairButton({
  state,
  onStateChange,
  onConnected,
  onSample,
  onDisconnect,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const disabled = busy || state === "connecting" || state === "pairing";

  async function onClick() {
    setBusy(true);
    try {
      onStateChange("pairing");
      const { device, server } = await pairAndConnect();
      onStateChange("connecting");
      const unsubscribe = await subscribeHR(device, server, onSample, onDisconnect);
      onStateChange("connected");
      onConnected(device, unsubscribe);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown BLE error";
      onError(message);
      onStateChange("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-[var(--lime)] px-5 py-2 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {labelFor(state, busy)}
    </button>
  );
}

function labelFor(state: ConnectionState, busy: boolean): string {
  if (busy || state === "pairing") return "Opening picker…";
  if (state === "connecting") return "Connecting…";
  if (state === "connected") return "Reconnect";
  return "Pair band";
}

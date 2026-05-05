"use client";

import type { ConnectionState } from "@/lib/ble/connection";
import type { HRSample } from "@/lib/ble/hr-codec";

type Props = {
  state: ConnectionState;
  sample?: HRSample;
  deviceName?: string;
  errorMessage?: string;
  onDisconnect?: () => void;
};

export function ConnectionStatus({
  state,
  sample,
  deviceName,
  errorMessage,
  onDisconnect,
}: Props) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-5 text-stone-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Status</p>
          <p className="text-base font-medium">{badgeLabel(state)}</p>
          {deviceName && state !== "idle" && (
            <p className="mt-0.5 text-xs text-stone-500">{deviceName}</p>
          )}
        </div>
        {state === "connected" && onDisconnect && (
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition hover:bg-stone-100"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">Heart rate</p>
        <p className="mt-1 text-5xl font-light tabular-nums">
          {sample ? sample.hr_bpm : "--"}
          <span className="ml-2 text-base text-stone-500">bpm</span>
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">R-R intervals (ms)</p>
        <p className="mt-1 font-mono text-sm text-stone-700">
          {sample && sample.rr_ms.length > 0
            ? sample.rr_ms.map((rr) => rr.toFixed(1)).join(", ")
            : "—"}
        </p>
      </div>

      {sample && (
        <p className="mt-3 text-xs text-stone-500">
          Sensor contact: <span className="font-medium">{sample.contact}</span>
        </p>
      )}

      {state === "error" && errorMessage && (
        <p className="mt-3 text-xs text-red-700">Error: {errorMessage}</p>
      )}
    </div>
  );
}

function badgeLabel(state: ConnectionState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "pairing":
      return "Pairing…";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
  }
}

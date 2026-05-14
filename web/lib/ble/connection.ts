// Web Bluetooth wrapper for the standard HR profile (service 0x180D, char 0x2A37).
// Browser-only — never imported from server routes. Slice 5 ships pair/connect/subscribe
// only; reconnect/backoff lands with the batcher in Slice 6.

import { decodeHR, type HRSample } from "./hr-codec";
import { PMD_SERVICE_UUID } from "./pmd-types";

export type ConnectionState =
  | "idle"
  | "pairing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export async function pairAndConnect(): Promise<{
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
}> {
  if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth unavailable in this browser");
  }
  // PMD must be in optionalServices or Chrome silently refuses
  // `getPrimaryService(PMD_SERVICE_UUID)` with a SecurityError. That's the
  // reason ACC/ECG stayed at 0 in the 2026-05-14 live test even after the
  // codec fix landed — pairing succeeded, HR worked (standard service is
  // in filters), but the proprietary service was blocked at the OS level
  // and the error was caught by the PMD start try/catch upstream.
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ["heart_rate"] }],
    optionalServices: ["battery_service", PMD_SERVICE_UUID],
  });
  if (!device.gatt) {
    throw new Error("Selected device exposes no GATT server");
  }
  const server = await device.gatt.connect();
  return { device, server };
}

export async function subscribeHR(
  device: BluetoothDevice,
  server: BluetoothRemoteGATTServer,
  onSample: (sample: HRSample) => void,
  onDisconnect: () => void,
): Promise<() => Promise<void>> {
  const service = await server.getPrimaryService("heart_rate");
  const characteristic = await service.getCharacteristic("heart_rate_measurement");

  const handleValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (!value) return;
    try {
      onSample(decodeHR(value));
    } catch (err) {
      console.error("[hr-codec] decode failed", err);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
  };

  characteristic.addEventListener("characteristicvaluechanged", handleValue);
  device.addEventListener("gattserverdisconnected", handleDisconnect);
  await characteristic.startNotifications();

  let unsubscribed = false;
  return async () => {
    if (unsubscribed) return;
    unsubscribed = true;
    characteristic.removeEventListener("characteristicvaluechanged", handleValue);
    device.removeEventListener("gattserverdisconnected", handleDisconnect);
    try {
      await characteristic.stopNotifications();
    } catch (err) {
      // GATT may already be gone; not actionable.
      console.warn("[ble] stopNotifications failed", err);
    }
    if (server.connected) {
      server.disconnect();
    }
  };
}

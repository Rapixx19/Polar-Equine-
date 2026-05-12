// Web Bluetooth wrapper for the standard HR profile (service 0x180D, char 0x2A37).
// Browser-only — never imported from server routes. Slice 5 ships pair/connect/subscribe
// only; reconnect/backoff lands with the batcher in Slice 6.

import { decodeHR, type HRSample } from "./hr-codec";

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
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ["heart_rate"] }],
    // Polar PMD service is requested up-front so PMD characteristics can be
    // discovered later by use-ingest-session without re-prompting the user.
    optionalServices: ["battery_service", "fb005c80-02e7-f387-1cad-8acd2d8df0c8"],
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

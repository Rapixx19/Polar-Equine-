// Orchestrates a single PMD measurement stream over Web Bluetooth: sets up the
// Data + Control Point characteristics, writes the START command, awaits the
// SUCCESS indication, and exposes a cleanup that writes STOP + unsubscribes.
//
// Browser-only — never imported from server routes. Returns a closer rather
// than a class so multiple concurrent streams (ACC + ECG) can be cleaned up
// independently.

import {
  PMD_CONTROL_POINT_UUID,
  PMD_DATA_UUID,
  PMD_SERVICE_UUID,
  encodeStop,
  parseControlResponse,
  pmdErrorName,
  type MeasType,
} from "./pmd-protocol";

const CONTROL_RESPONSE_TIMEOUT_MS = 3000;

export type StartPmdStreamOpts = {
  measType: MeasType;
  startBytes: Uint8Array;
};

export type PmdStreamCloser = () => Promise<void>;

export async function startPmdStream(
  server: BluetoothRemoteGATTServer,
  opts: StartPmdStreamOpts,
  onFrame: (view: DataView) => void,
): Promise<PmdStreamCloser> {
  const service = await server.getPrimaryService(PMD_SERVICE_UUID);
  const dataChar = await service.getCharacteristic(PMD_DATA_UUID);
  const controlChar = await service.getCharacteristic(PMD_CONTROL_POINT_UUID);

  // Resolve the next Control Point indication that echoes our measType.
  let pendingResolve: ((view: DataView) => void) | null = null;
  let pendingReject: ((err: Error) => void) | null = null;

  const handleControlValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (!value || !pendingResolve) return;
    pendingResolve(value);
    pendingResolve = null;
    pendingReject = null;
  };

  const handleDataValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (!value) return;
    try {
      onFrame(value);
    } catch (err) {
      console.error(`[pmd] data frame decode failed (measType=0x${opts.measType.toString(16)})`, err);
    }
  };

  controlChar.addEventListener("characteristicvaluechanged", handleControlValue);
  dataChar.addEventListener("characteristicvaluechanged", handleDataValue);

  // Per Web Bluetooth + polar-ble-sdk: subscribe Data first, then Control Point,
  // THEN write the START command. Reverse order silently fails on some browsers.
  await dataChar.startNotifications();
  await controlChar.startNotifications();

  let startWritten = false;
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    controlChar.removeEventListener("characteristicvaluechanged", handleControlValue);
    dataChar.removeEventListener("characteristicvaluechanged", handleDataValue);
    if (pendingReject) {
      pendingReject(new Error("pmd stream cleanup before start response"));
      pendingResolve = null;
      pendingReject = null;
    }
    if (startWritten) {
      try {
        await controlChar.writeValueWithResponse(encodeStop(opts.measType).buffer as ArrayBuffer);
      } catch (err) {
        console.warn(`[pmd] stop write failed (measType=0x${opts.measType.toString(16)})`, err);
      }
    }
    try {
      await dataChar.stopNotifications();
    } catch (err) {
      console.warn("[pmd] data stopNotifications failed", err);
    }
    try {
      await controlChar.stopNotifications();
    } catch (err) {
      console.warn("[pmd] control stopNotifications failed", err);
    }
  };

  // Write START + await Control Point response.
  const responsePromise = new Promise<DataView>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    setTimeout(() => {
      if (pendingReject) {
        const err = new Error(`pmd start response timeout (measType=0x${opts.measType.toString(16)})`);
        pendingReject(err);
        pendingResolve = null;
        pendingReject = null;
      }
    }, CONTROL_RESPONSE_TIMEOUT_MS);
  });

  try {
    await controlChar.writeValueWithResponse(opts.startBytes.buffer as ArrayBuffer);
    startWritten = true;
  } catch (err) {
    await cleanup();
    throw err;
  }

  let responseView: DataView;
  try {
    responseView = await responsePromise;
  } catch (err) {
    await cleanup();
    throw err;
  }

  const response = parseControlResponse(responseView);
  if (!response.ok) {
    await cleanup();
    throw new Error(
      `pmd start rejected (measType=0x${opts.measType.toString(16)}): ${response.errorName} (0x${response.errorCode.toString(16).padStart(2, "0")})`,
    );
  }
  if (response.measType !== opts.measType) {
    // Indication landed for the wrong measurement type. Treat as a protocol bug.
    await cleanup();
    throw new Error(
      `pmd start response measType mismatch: expected 0x${opts.measType.toString(16)}, got 0x${response.measType.toString(16)} (${pmdErrorName(response.errorCode)})`,
    );
  }

  return cleanup;
}

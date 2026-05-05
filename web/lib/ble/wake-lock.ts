"use client";

// Web Wake Lock API wrapper. Best-effort: returns null gracefully if the
// API is missing (older Bluefy versions, Safari without the flag).
//
// Lifecycle:
//   - acquire on session start
//   - release on session end
//   - re-acquire on sentinel 'release' event when isSessionActive() is true
//     (catches iOS battery-saver releases that don't fire visibilitychange)
//   - re-acquire on visibilitychange === 'visible' when active (consumer-managed)
//
// Single-sentinel: idempotent acquire while holding.

type Sentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (event: "release", listener: () => void) => void;
  removeEventListener: (event: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

export type WakeLockHandle = { sentinel: Sentinel };

let current: WakeLockHandle | null = null;
let releaseListener: (() => void) | null = null;
let isActiveFn: () => boolean = () => false;

function getApi(): NavigatorWithWakeLock["wakeLock"] | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as NavigatorWithWakeLock).wakeLock;
}

export async function acquireWakeLock(isSessionActive: () => boolean): Promise<WakeLockHandle | null> {
  isActiveFn = isSessionActive;
  if (current) return current;
  const api = getApi();
  if (!api) return null;
  let sentinel: Sentinel;
  try {
    sentinel = await api.request("screen");
  } catch {
    return null;
  }
  current = { sentinel };
  releaseListener = () => {
    // Only re-acquire if a session is still active. Don't fight an explicit release.
    if (current && current.sentinel === sentinel && !sentinel.released) return;
    current = null;
    if (isActiveFn()) {
      void acquireWakeLock(isActiveFn);
    }
  };
  sentinel.addEventListener("release", releaseListener);
  return current;
}

export async function releaseWakeLock(): Promise<void> {
  if (!current) return;
  if (releaseListener) {
    current.sentinel.removeEventListener("release", releaseListener);
    releaseListener = null;
  }
  try {
    await current.sentinel.release();
  } catch {
    /* already released */
  }
  current = null;
  isActiveFn = () => false;
}

// Test-only: clear module-level state without going through release() so
// tests don't accidentally re-acquire via a release listener that survived
// the navigator swap. Not exported in the public consumer surface.
export function resetWakeLockForTests(): void {
  current = null;
  releaseListener = null;
  isActiveFn = () => false;
}

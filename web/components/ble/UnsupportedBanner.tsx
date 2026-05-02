"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// On the server we assume support so the banner doesn't flash; the client snapshot
// runs on hydration and reveals it for browsers without Web Bluetooth.
function getServerSnapshot(): boolean {
  return true;
}

export function UnsupportedBanner() {
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (supported) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">Web Bluetooth isn&apos;t available in this browser.</p>
      <p className="mt-1">
        Use Chrome on Android or desktop Chrome. Full iOS support is coming in V.0.1.
      </p>
    </div>
  );
}

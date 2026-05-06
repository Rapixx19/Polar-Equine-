"use client";

import { useSyncExternalStore } from "react";

// No-op subscribe: support state is fixed for the page lifetime — no events to listen for.
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// SSR contract: assume "supported" so the banner doesn't render on the server. On
// hydration, getSnapshot runs in the browser; if Web Bluetooth is missing, the
// banner appears once. This is intentional — flipping the other way (assume
// unsupported) would render the banner during SSR and flash for every supported user.
function getServerSnapshot(): boolean {
  return true;
}

export function UnsupportedBanner() {
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (supported) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200"
    >
      <p className="font-medium">Web Bluetooth isn&apos;t available in this browser.</p>
      <p className="mt-1">
        On iPhone, open this page in <strong>Bluefy</strong> (free in the App Store).
        On other devices, use desktop Chrome or Chrome on Android.
      </p>
    </div>
  );
}

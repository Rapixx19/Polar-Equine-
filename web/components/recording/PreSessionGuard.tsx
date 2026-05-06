"use client";

import { useSyncExternalStore } from "react";

import { shouldShowGuard } from "@/lib/ui/pre-session-guard";

const DISMISS_KEY = "pre-session-guard:dismissed";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  if (typeof navigator === "undefined") return false;
  const dismissed =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DISMISS_KEY) === "1";
  return shouldShowGuard({ userAgent: navigator.userAgent, dismissed });
}

// SSR contract: don't render the guard during SSR. On hydration, getSnapshot
// runs in the browser and the banner appears once for iOS users who haven't
// yet dismissed. Mirrors UnsupportedBanner's useSyncExternalStore pattern.
function getServerSnapshot(): boolean {
  return false;
}

function dismiss(): void {
  sessionStorage.setItem(DISMISS_KEY, "1");
  for (const listener of listeners) listener();
}

export function PreSessionGuard() {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!show) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200"
    >
      <p className="font-medium">Keep your screen on during the ride.</p>
      <p className="mt-1">
        Lock your phone and Bluetooth pauses, which can interrupt recording.
        (Tip: Settings → Display → Auto-Lock → Never.)
      </p>
      <button
        type="button"
        className="mt-3 rounded-md bg-amber-200 px-3 py-1.5 text-xs font-medium text-[var(--canvas)] hover:bg-amber-100"
        onClick={dismiss}
      >
        Got it
      </button>
    </div>
  );
}

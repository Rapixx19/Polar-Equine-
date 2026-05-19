"use client";

import { useSyncExternalStore } from "react";

import { shouldShowGuard, type GuardPlatform } from "@/lib/ui/pre-session-guard";

const DISMISS_KEY = "pre-session-guard:dismissed";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): GuardPlatform {
  if (typeof navigator === "undefined") return null;
  const dismissed =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(DISMISS_KEY) === "1";
  return shouldShowGuard({ userAgent: navigator.userAgent, dismissed });
}

function getServerSnapshot(): GuardPlatform {
  return null;
}

function getStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function getStandaloneServer(): boolean {
  return false;
}

const standaloneListeners = new Set<() => void>();
function subscribeStandalone(listener: () => void): () => void {
  standaloneListeners.add(listener);
  return () => {
    standaloneListeners.delete(listener);
  };
}

function dismiss(): void {
  sessionStorage.setItem(DISMISS_KEY, "1");
  for (const listener of listeners) listener();
}

export function PreSessionGuard() {
  const platform = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandalone,
    getStandaloneServer,
  );
  if (!platform) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200"
    >
      {platform === "ios" ? (
        <>
          <p className="font-medium">Keep your screen on during the ride.</p>
          <p className="mt-1">
            Lock your phone and Bluetooth pauses, which can interrupt recording.
            (Tip: Settings → Display → Auto-Lock → Never.)
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">Before you start the ride</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {!isStandalone && (
              <li>
                <strong>Install the app:</strong> Chrome menu → &ldquo;Add to Home screen&rdquo;.
                Tabs get killed in the background; installed PWAs survive longer.
              </li>
            )}
            <li>
              <strong>Allow background:</strong> Settings → Apps → Chrome → Battery →{" "}
              <em>Unrestricted</em>.
            </li>
            <li>
              <strong>Turn off battery saver</strong> for the duration of the ride
              (it freezes background Bluetooth).
            </li>
            <li>
              Keep the screen on and the app in the foreground while you ride. We
              try to reconnect automatically if the link drops.
            </li>
          </ul>
        </>
      )}
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

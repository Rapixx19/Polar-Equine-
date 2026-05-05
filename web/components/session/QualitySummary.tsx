"use client";

import { useSyncExternalStore } from "react";

import type { QualitySummary as Summary } from "@/lib/ble/capture-quality";

const cache = new Map<string, Summary | null>();

function readOnce(sessionId: string): Summary | null {
  if (cache.has(sessionId)) return cache.get(sessionId) ?? null;
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(`quality:${sessionId}`);
  let parsed: Summary | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Summary;
    } catch {
      // malformed entry — fail silent, no fake number per Rule 9
      parsed = null;
    }
  }
  cache.set(sessionId, parsed);
  return parsed;
}

const noopSubscribe = (): (() => void) => () => {};
const serverSnapshot = (): Summary | null => null;

export function QualitySummary({ sessionId }: { sessionId: string }) {
  const summary = useSyncExternalStore(
    noopSubscribe,
    () => readOnce(sessionId),
    serverSnapshot,
  );
  if (!summary || summary.windowCount === 0) return null;

  const goodPct = Math.round(summary.goodPct * 100);
  const dot = goodPct >= 90 ? "🟢" : goodPct >= 60 ? "🟡" : "🔴";
  const label =
    goodPct >= 90 ? "Good signal" : goodPct >= 60 ? "Mixed signal" : "Poor signal";

  return (
    <p className="text-sm text-stone-600">
      Recording quality: <span aria-hidden>{dot}</span> {label} for {goodPct}% of session
    </p>
  );
}

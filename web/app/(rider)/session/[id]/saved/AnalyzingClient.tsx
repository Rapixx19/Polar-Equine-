"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StatusResp = {
  status: "active" | "completed" | "abandoned" | "approved";
  metrics_status: "pending" | "computing" | "complete" | "failed";
  activity_type: string;
};

// Rotating reassurance messages while the algo computes. Order matters —
// each one corresponds to a phase a rider intuitively expects to happen.
const PHASES = [
  "Saving your ride…",
  "Reading heart-rate samples…",
  "Detecting gaits…",
  "Putting it all together…",
] as const;

const POLL_MS = 2_000;
const PHASE_MS = 2_500;
const STALL_TIMEOUT_MS = 90_000;

export function AnalyzingClient({
  sessionId,
  horseName,
}: {
  sessionId: string;
  horseName: string;
}) {
  const router = useRouter();
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, PHASE_MS);
    return () => clearInterval(phaseTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError("status_unavailable");
          return;
        }
        const body = (await res.json()) as StatusResp;
        if (cancelled) return;

        if (body.metrics_status === "failed") {
          setError("compute_failed");
          return;
        }
        if (body.status === "approved") {
          router.replace("/home");
          return;
        }
        if (body.metrics_status === "complete") {
          // Only ridden sessions get the labeling UI — non-riding (stall,
          // walker, transport, vet, etc.) has no gait timeline worth
          // labeling, so we keep the rider on /saved and let the server
          // re-render into the read-only summary view.
          if (body.activity_type === "riding") {
            router.replace(`/session/${sessionId}/review`);
          } else {
            router.refresh();
          }
          return;
        }
        if (startedAt.current !== null && Date.now() - startedAt.current > STALL_TIMEOUT_MS) {
          setStalled(true);
          return;
        }
        setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) setError("network_error");
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  if (error === "compute_failed") {
    return (
      <Frame horseName={horseName}>
        <p className="mb-4 text-sm text-[var(--text)]">
          Something went wrong while analyzing your ride. Your data is safe — we&apos;ll retry
          automatically and let you know on the home screen.
        </p>
        <HomeButton />
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame horseName={horseName}>
        <p className="mb-4 text-sm text-[var(--text)]">
          Lost connection while waiting. Your ride was saved — head back to home and you&apos;ll
          see it as soon as it&apos;s ready to label.
        </p>
        <HomeButton />
      </Frame>
    );
  }

  if (stalled) {
    return (
      <Frame horseName={horseName}>
        <p className="mb-4 text-sm text-[var(--text)]">
          Still working on it. This usually takes under a minute — you can wait, or come back from
          home in a moment.
        </p>
        <HomeButton />
      </Frame>
    );
  }

  return (
    <Frame horseName={horseName}>
      <div className="mb-8 flex flex-col items-center" role="status" aria-live="polite">
        <PulseRing />
        <p className="mt-6 min-h-[1.25rem] text-sm text-[var(--text-muted)] transition-opacity">
          {PHASES[phaseIdx]}
        </p>
      </div>
      <p className="text-xs text-[var(--text-faint)]">
        We&apos;ll open your ride for review as soon as it&apos;s ready.
      </p>
    </Frame>
  );
}

function Frame({ horseName, children }: { horseName: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--lime)]">
          Ride finished
        </p>
        <h1 className="mb-8 text-2xl font-light">Analyzing {horseName}&apos;s session</h1>
        {children}
      </div>
    </main>
  );
}

function PulseRing() {
  return (
    <span className="relative inline-flex h-16 w-16 items-center justify-center">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lime)] opacity-30"
        aria-hidden
      />
      <span
        className="absolute inline-flex h-10 w-10 animate-pulse rounded-full bg-[var(--lime)] opacity-60"
        aria-hidden
      />
      <span className="relative inline-flex h-4 w-4 rounded-full bg-[var(--lime)]" aria-hidden />
    </span>
  );
}

function HomeButton() {
  return (
    <a
      href="/home"
      className="inline-block rounded-md bg-[var(--lime)] px-6 py-2.5 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90"
    >
      Back to home
    </a>
  );
}

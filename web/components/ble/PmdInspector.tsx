"use client";

import { useEffect, useRef, useState } from "react";

import { startPmdStreams } from "@/lib/ble/pmd-service";

// Pre-flight tool: subscribes to the H10 PMD streams independently of any
// recording session and renders raw byte previews + decoded sample counts.
// Lets us confirm the codec works against a real band before betting a horse
// session on it. Logs to the browser console too — copy/paste-friendly.

type FrameLog = { t: number; kind: "acc" | "ecg" | "raw" | "error"; detail: string };

const MAX_LOGS = 25;

export function PmdInspector({ server }: { server: BluetoothRemoteGATTServer | null }) {
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({ frames: 0, acc: 0, ecg: 0, errors: 0 });
  const [logs, setLogs] = useState<FrameLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => {
      void stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  function push(entry: FrameLog) {
    setLogs((prev) => {
      const next = [entry, ...prev];
      return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next;
    });
  }

  async function start() {
    if (!server) {
      setError("Pair the band first.");
      return;
    }
    setError(null);
    setLogs([]);
    setCounts({ frames: 0, acc: 0, ecg: 0, errors: 0 });
    try {
      const stop = await startPmdStreams(server, {
        onRawFrame: ({ byteLength, hexPreview }) => {
          setCounts((c) => ({ ...c, frames: c.frames + 1 }));
          push({ t: Date.now(), kind: "raw", detail: `${byteLength}B ${hexPreview}` });
          console.log("[pmd-raw]", byteLength, hexPreview);
        },
        onAccBatch: (samples) => {
          setCounts((c) => ({ ...c, acc: c.acc + samples.length }));
          const s = samples[0];
          if (s) push({ t: Date.now(), kind: "acc", detail: `x${samples.length} first ax=${s.ax_mg}mg ay=${s.ay_mg} az=${s.az_mg}` });
          console.log("[pmd-acc]", samples.length, samples.slice(0, 3));
        },
        onEcgBatch: (samples) => {
          setCounts((c) => ({ ...c, ecg: c.ecg + samples.length }));
          const s = samples[0];
          if (s) push({ t: Date.now(), kind: "ecg", detail: `x${samples.length} first uv=${s.uv}` });
          console.log("[pmd-ecg]", samples.length, samples.slice(0, 3));
        },
        onDecodeError: ({ byteLength, reason }) => {
          setCounts((c) => ({ ...c, errors: c.errors + 1 }));
          push({ t: Date.now(), kind: "error", detail: `${byteLength}B ${reason}` });
          console.warn("[pmd-err]", byteLength, reason);
        },
      });
      stopRef.current = stop;
      setRunning(true);
    } catch (err) {
      setError(String(err));
    }
  }

  async function stop() {
    const fn = stopRef.current;
    stopRef.current = null;
    setRunning(false);
    if (fn) await fn();
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-medium text-[var(--text-muted)]">PMD frame inspector</h2>
      <p className="mt-1 text-xs text-[var(--text-faint)]">
        Pre-flight only. Streams ACC + ECG independently of any recording session — nothing is saved.
        Use this for the first 30 s on the horse to confirm the codec works.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={running || !server}
          className="rounded-md border border-[var(--lime)] px-3 py-1.5 text-sm text-[var(--lime)] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--lime)] hover:text-[var(--canvas)]"
        >
          Start PMD inspection
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={!running}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Stop
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-[var(--red)] bg-[var(--red)]/10 p-2 text-xs text-[var(--red)]">
          {error}
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <Stat label="Frames" value={counts.frames} />
        <Stat label="ACC samples" value={counts.acc} good={counts.acc > 0} />
        <Stat label="ECG samples" value={counts.ecg} good={counts.ecg > 0} />
        <Stat label="Decode errors" value={counts.errors} bad={counts.errors > 0} />
      </dl>

      <div className="mt-3 max-h-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--canvas)] p-2 font-mono text-[10px] leading-relaxed">
        {logs.length === 0 ? (
          <span className="text-[var(--text-faint)]">No frames yet.</span>
        ) : (
          logs.map((l, i) => (
            <div key={i} className={kindColor(l.kind)}>
              {fmtTime(l.t)} [{l.kind}] {l.detail}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  const tone = bad ? "text-[var(--red)]" : good ? "text-[var(--lime)]" : "text-[var(--text-muted)]";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--canvas)] p-2">
      <dt className="text-[var(--text-faint)]">{label}</dt>
      <dd className={`tabular-nums ${tone}`}>{value.toLocaleString()}</dd>
    </div>
  );
}

function kindColor(kind: FrameLog["kind"]): string {
  if (kind === "error") return "text-[var(--red)]";
  if (kind === "acc") return "text-[var(--lime)]";
  if (kind === "ecg") return "text-[var(--text)]";
  return "text-[var(--text-muted)]";
}

function fmtTime(t: number): string {
  const d = new Date(t);
  return `${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
}

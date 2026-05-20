"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { SESSION_KINDS, type SessionKind } from "@/lib/session-kinds";

function subscribeSpeechRecognition(): () => void {
  // No external mutation — the SR class is set once at page-load time.
  return () => {};
}
function getSpeechRecognitionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return (window.SpeechRecognition ?? window.webkitSpeechRecognition) != null;
}
function getServerSpeechRecognitionSnapshot(): boolean {
  return false;
}

type Props = {
  sessionId: string;
  horseName: string;
  initialKindId: string | null;
  initialNotes: string;
};

export function FinalizeClient({ sessionId, horseName, initialKindId, initialNotes }: Props) {
  const router = useRouter();
  const [kindId, setKindId] = useState<string | null>(initialKindId);
  const [notes, setNotes] = useState(initialNotes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = SESSION_KINDS.find((k) => k.id === kindId) ?? null;
  const canSubmit = selected !== null && !submitting;

  const onConfirm = useCallback(async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          kind_id: selected.id,
          activity_type: selected.activity_type,
          riding_subtype: selected.riding_subtype,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }, [sessionId, selected, notes, router]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg p-5 pb-32">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[var(--lime)]">Ride finished</p>
        <h1 className="mt-1 text-2xl font-light">What did {horseName} do?</h1>
        <p className="mt-1 text-sm text-[var(--text-faint)]">
          Pick one. We&apos;ll start analysing as soon as you confirm.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-2">
        {SESSION_KINDS.map((kind) => (
          <KindChip
            key={kind.id}
            kind={kind}
            selected={kind.id === kindId}
            onSelect={() => setKindId(kind.id)}
          />
        ))}
      </div>

      <NotesField value={notes} onChange={setNotes} />

      {error ? (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={onConfirm}
        className="w-full rounded-md bg-[var(--lime)] px-6 py-3 text-sm font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Saving…" : "Confirm and analyse"}
      </button>
    </main>
  );
}

function KindChip({
  kind,
  selected,
  onSelect,
}: {
  kind: SessionKind;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        selected
          ? "border-[var(--lime)] bg-[var(--lime)]/10"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-faint)]"
      }`}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {kind.emoji}
      </span>
      <span className="text-sm font-medium">{kind.label}</span>
    </button>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  // Web Speech API is webkit-prefixed on Safari; the unprefixed name is
  // Chrome/Edge. Subscribe via useSyncExternalStore so the SSR pass renders
  // without the mic button and the client hydrates with the live answer
  // — avoids the setState-in-effect anti-pattern.
  const voiceSupported = useSyncExternalStore(
    subscribeSpeechRecognition,
    getSpeechRecognitionSnapshot,
    getServerSpeechRecognitionSnapshot,
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseValueRef = useRef<string>(value);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SR =
      typeof window !== "undefined"
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : null;
    if (!SR) return;
    const r = new SR();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = true;
    baseValueRef.current = value;
    r.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      const base = baseValueRef.current.trim();
      const next = [base, final + interim].filter(Boolean).join(" ").trim();
      onChange(next);
      if (final) baseValueRef.current = next;
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }, [value, onChange]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  return (
    <div className="mb-6">
      <label htmlFor="session-notes" className="mb-2 block text-sm font-medium">
        Notes
      </label>
      <div className="relative">
        <textarea
          id="session-notes"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What stood out? Anything Emma should know?"
          rows={4}
          maxLength={2000}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-12 text-sm placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
        {voiceSupported ? (
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-label={listening ? "Stop dictating" : "Dictate in Italian"}
            aria-pressed={listening}
            className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
              listening
                ? "border-red-400 bg-red-400/10 text-red-400"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] hover:text-[var(--lime)]"
            }`}
          >
            <span aria-hidden>🎤</span>
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-faint)]">
        {voiceSupported
          ? "Tap 🎤 to dictate in Italian. Tap again to stop."
          : "Voice dictation isn’t supported in this browser."}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";

type Initial = {
  notes: string | null;
  horse_feel: string | null;
  cooldown_notes: string | null;
};

const MAX_LEN = 2000;

type SaveState = "idle" | "saving" | "saved" | "error";

export function SessionNotesForm({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Initial;
}) {
  const [baseline, setBaseline] = useState({
    notes: initial.notes ?? "",
    horse_feel: initial.horse_feel ?? "",
    cooldown_notes: initial.cooldown_notes ?? "",
  });
  const [notes, setNotes] = useState(baseline.notes);
  const [horseFeel, setHorseFeel] = useState(baseline.horse_feel);
  const [cooldown, setCooldown] = useState(baseline.cooldown_notes);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    notes !== baseline.notes ||
    horseFeel !== baseline.horse_feel ||
    cooldown !== baseline.cooldown_notes;

  async function onSave() {
    if (!dirty || state === "saving") return;
    setState("saving");
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (notes !== baseline.notes) body.notes = notes;
      if (horseFeel !== baseline.horse_feel) body.horse_feel = horseFeel;
      if (cooldown !== baseline.cooldown_notes) body.cooldown_notes = cooldown;
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setState("error");
        setError("Couldn't save. Try again.");
        return;
      }
      setBaseline({ notes, horse_feel: horseFeel, cooldown_notes: cooldown });
      setState("saved");
    } catch {
      setState("error");
      setError("Couldn't save. Try again.");
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-left">
      <Field
        id="notes"
        label="What did you do?"
        hint="Exercises, drills, anything notable about the work."
        value={notes}
        onChange={(v) => {
          setNotes(v);
          if (state !== "idle") setState("idle");
        }}
      />
      <Field
        id="horse_feel"
        label="How did the horse feel?"
        hint="Energy, attitude, lameness signs, anything off."
        value={horseFeel}
        onChange={(v) => {
          setHorseFeel(v);
          if (state !== "idle") setState("idle");
        }}
      />
      <Field
        id="cooldown_notes"
        label="Cool-down — anything you noticed?"
        hint="Breathing, sweat, recovery, gait."
        value={cooldown}
        onChange={(v) => {
          setCooldown(v);
          if (state !== "idle") setState("idle");
        }}
      />

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || state === "saving"}
          className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save notes"}
        </button>
        <span className="text-xs text-[var(--text-faint)]" aria-live="polite">
          {state === "saved" && "Saved ✓"}
          {state === "error" && (error ?? "Couldn't save.")}
        </span>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const remaining = MAX_LEN - value.length;
  const overLimit = remaining < 0;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text)]">
        {label}
      </label>
      <p className="mb-2 text-xs text-[var(--text-faint)]">{hint}</p>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={MAX_LEN}
        className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        placeholder=""
      />
      <div
        className={`mt-1 text-right text-xs ${
          overLimit ? "text-[var(--red,#c00)]" : "text-[var(--text-faint)]"
        }`}
      >
        {value.length}/{MAX_LEN}
      </div>
    </div>
  );
}

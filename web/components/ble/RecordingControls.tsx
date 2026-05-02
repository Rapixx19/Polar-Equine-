"use client";

import type { ActivityType } from "@/lib/activities";
import type { ConnectionState } from "@/lib/ble/connection";
import type { IngestState } from "@/lib/ble/use-ingest-session";

type HorseOption = { id: string; name: string };

type Props = {
  connectionState: ConnectionState;
  horses: HorseOption[];
  horseId: string;
  onHorseChange: (id: string) => void;
  activityType: ActivityType;
  onActivityChange: (type: ActivityType) => void;
  activityOptions: ReadonlyArray<ActivityType>;
  ingestState: IngestState;
  flushedCount: number;
  droppedCount: number;
  ingestError: string | null;
  onStart: () => void;
  onStop: () => void;
};

export function RecordingControls({
  connectionState,
  horses,
  horseId,
  onHorseChange,
  activityType,
  onActivityChange,
  activityOptions,
  ingestState,
  flushedCount,
  droppedCount,
  ingestError,
  onStart,
  onStop,
}: Props) {
  const isRecording = ingestState === "recording";
  const isBusy = ingestState === "starting" || ingestState === "stopping";
  const canStart = connectionState === "connected" && ingestState === "off" && horses.length > 0 && horseId !== "";
  const canStop = isRecording;

  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-medium text-stone-800">Record session</h2>

      {horses.length === 0 ? (
        <p className="mt-2 text-xs text-amber-700">
          No horses are linked to your rider profile yet. Ask an admin to add you to one.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-stone-600">
            Horse
            <select
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
              value={horseId}
              onChange={(e) => onHorseChange(e.target.value)}
              disabled={isRecording || isBusy}
            >
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-600">
            Activity
            <select
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
              value={activityType}
              onChange={(e) => onActivityChange(e.target.value as ActivityType)}
              disabled={isRecording || isBusy}
            >
              {activityOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4">
        {canStop ? (
          <button
            type="button"
            onClick={onStop}
            disabled={isBusy}
            className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-60"
          >
            Stop session
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || isBusy}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? "Starting…" : "Start session + record"}
          </button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-stone-600">
        <div>
          <dt className="text-stone-400">State</dt>
          <dd className="font-mono text-stone-800">{ingestState}</dd>
        </div>
        <div>
          <dt className="text-stone-400">Flushed</dt>
          <dd className="font-mono text-stone-800">{flushedCount}</dd>
        </div>
        <div>
          <dt className="text-stone-400">Dropped</dt>
          <dd className={`font-mono ${droppedCount > 0 ? "text-rose-700" : "text-stone-800"}`}>
            {droppedCount}
          </dd>
        </div>
      </dl>

      {ingestError ? (
        <p className="mt-2 text-xs text-rose-700">{ingestError}</p>
      ) : null}
    </section>
  );
}

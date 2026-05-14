// Verbatim row-dump anonymisation. Unlike `anonymiseBundle()` this does
// NOT rename columns or flatten auto/corrected pairs — it returns the
// raw DB shape so the recipient (freelancer) can reproduce metrics
// using the same column names the algorithm sees. PII is still
// stripped: rider_id + horse_id become pseudonyms, rider.display_name
// + horse.name are never fetched.

import { buildPseudonymMap } from "./anonymise";

export type RawSession = {
  id: string;
  rider_id: string;
  horse_id: string;
  band_id: string | null;
  activity_type: string;
  start_time: string;
  end_time: string | null;
  status: string;
  metrics_status: string | null;
  created_at: string | null;
};

export type RawBundleInput = {
  session: RawSession;
  samples_hr: Array<Record<string, unknown>>;
  samples_acc: Array<Record<string, unknown>>;
  samples_ecg: Array<Record<string, unknown>>;
  labels: Array<Record<string, unknown>>;
  label_corrections: Array<Record<string, unknown>>;
  session_metrics: Record<string, unknown> | null;
  export_id: string;
  exported_at: string;
  // Slice 12 maturity gate: default omits ACC/ECG arrays from the bundle so
  // a freelancer hand-off can't ship un-validated PMD data by accident.
  // Manifest row_counts are always honest — only the row arrays are gated.
  include?: { acc?: boolean; ecg?: boolean };
};

export type RawAnonymisedBundle = {
  manifest: {
    export_id: string;
    session_id: string;
    exported_at: string;
    schema_version: 1;
    shape: "raw-verbatim";
    sensor_sources: Record<string, string>;
    row_counts: Record<string, number>;
    algo_version: string | null;
    included: { hr: true; acc: boolean; ecg: boolean };
  };
  session: Omit<RawSession, "rider_id" | "horse_id"> & {
    rider_pseudonym: string;
    horse_pseudonym: string;
  };
  samples_hr: Array<Record<string, unknown>>;
  samples_acc: Array<Record<string, unknown>> | null;
  samples_ecg: Array<Record<string, unknown>> | null;
  labels: Array<Record<string, unknown>>;
  label_corrections: Array<Record<string, unknown>>;
  session_metrics: Record<string, unknown> | null;
};

export const SENSOR_SOURCES: Record<string, string> = {
  samples_hr: "Polar H10 — BLE Heart Rate Service (0x180D). Columns: timestamp_ms (epoch ms), hr_bpm (int), rr_ms (int array, may be empty), contact (bool). ~1 Hz.",
  samples_acc: "Polar H10 — PMD service, 52 Hz tri-axial accelerometer. Columns: timestamp_ms (epoch ms), ax/ay/az (real, g — codec emits int mg and the ingest route divides by 1000 to fit DB real column). Multiply ax/ay/az by 1000 to recover mg.",
  samples_ecg: "Polar H10 — PMD service, 130 Hz raw ECG. Columns: timestamp_ms (epoch ms), ecg_uv (int µV, sign-extended from 24-bit LE).",
  labels: "Algorithm — auto-detected gait segments (algo writes; rider does not touch). Columns: start_ms, end_ms, label_type, algo_version.",
  label_corrections: "Algorithm + Rider — auto/corrected pairs; rider confirms or overrides via /sessions/[id]/review. Columns: auto_start_ms, auto_end_ms, auto_label_type, corrected_label_type, correction_kind.",
  session_metrics: "Algorithm — derived from samples_hr only. HR + HRV (RMSSD/SDNN/pNN50) + TRIMP + recovery τ + per-zone time. One row per session.",
};

export function stripIds<T extends Record<string, unknown>>(row: T): Omit<T, "session_id" | "id"> & { id?: never } {
  const { id: _id, session_id: _sid, ...rest } = row;
  void _id;
  void _sid;
  return rest as Omit<T, "session_id" | "id">;
}

export function anonymiseRawBundle(input: RawBundleInput): RawAnonymisedBundle {
  const riderMap = buildPseudonymMap([input.session.rider_id], "Rider");
  const horseMap = buildPseudonymMap([input.session.horse_id], "Horse");
  const { rider_id, horse_id, ...sessionRest } = input.session;
  void rider_id;
  void horse_id;
  const includeAcc = input.include?.acc === true;
  const includeEcg = input.include?.ecg === true;
  return {
    manifest: {
      export_id: input.export_id,
      session_id: input.session.id,
      exported_at: input.exported_at,
      schema_version: 1,
      shape: "raw-verbatim",
      sensor_sources: SENSOR_SOURCES,
      row_counts: {
        samples_hr: input.samples_hr.length,
        samples_acc: input.samples_acc.length,
        samples_ecg: input.samples_ecg.length,
        labels: input.labels.length,
        label_corrections: input.label_corrections.length,
      },
      algo_version: (input.session_metrics?.algo_version as string | undefined) ?? null,
      included: { hr: true, acc: includeAcc, ecg: includeEcg },
    },
    session: {
      ...sessionRest,
      rider_pseudonym: riderMap.get(input.session.rider_id) ?? "Rider-A",
      horse_pseudonym: horseMap.get(input.session.horse_id) ?? "Horse-A",
    },
    samples_hr: input.samples_hr.map(stripIds),
    samples_acc: includeAcc ? input.samples_acc.map(stripIds) : null,
    samples_ecg: includeEcg ? input.samples_ecg.map(stripIds) : null,
    labels: input.labels.map(stripIds),
    label_corrections: input.label_corrections.map(stripIds),
    session_metrics: input.session_metrics,
  };
}

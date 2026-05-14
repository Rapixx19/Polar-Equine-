// Per-stream slice of the raw bundle. Each export is a self-contained
// {manifest, rows} file: pseudonyms in the manifest, rider_id/horse_id never
// in the payload. Used when a freelancer only needs one signal at a time
// (e.g. just samples_acc for a gait-detection experiment).

import { buildPseudonymMap } from "./anonymise";
import { SENSOR_SOURCES, stripIds, type RawBundleInput } from "./anonymise-raw";

export type RawStream =
  | "hr"
  | "acc"
  | "ecg"
  | "labels"
  | "label_corrections"
  | "metrics";

export const RAW_STREAMS: RawStream[] = ["hr", "acc", "ecg", "labels", "label_corrections", "metrics"];

const STREAM_TABLE: Record<RawStream, string> = {
  hr: "samples_hr",
  acc: "samples_acc",
  ecg: "samples_ecg",
  labels: "labels",
  label_corrections: "label_corrections",
  metrics: "session_metrics",
};

export type RawStreamBundle = {
  manifest: {
    export_id: string;
    session_id: string;
    exported_at: string;
    schema_version: 1;
    shape: "raw-stream";
    stream: RawStream;
    table: string;
    sensor_source: string;
    row_count: number;
    rider_pseudonym: string;
    horse_pseudonym: string;
    activity_type: string;
    start_time: string;
    end_time: string | null;
    algo_version: string | null;
  };
  rows: Array<Record<string, unknown>> | Record<string, unknown> | null;
};

export function isRawStream(v: string): v is RawStream {
  return (RAW_STREAMS as string[]).includes(v);
}

export function anonymiseRawStream(input: RawBundleInput, stream: RawStream): RawStreamBundle {
  const riderMap = buildPseudonymMap([input.session.rider_id], "Rider");
  const horseMap = buildPseudonymMap([input.session.horse_id], "Horse");
  const table = STREAM_TABLE[stream];
  let rows: RawStreamBundle["rows"];
  let count: number;
  if (stream === "hr") {
    rows = input.samples_hr.map(stripIds);
    count = input.samples_hr.length;
  } else if (stream === "acc") {
    rows = input.samples_acc.map(stripIds);
    count = input.samples_acc.length;
  } else if (stream === "ecg") {
    rows = input.samples_ecg.map(stripIds);
    count = input.samples_ecg.length;
  } else if (stream === "labels") {
    rows = input.labels.map(stripIds);
    count = input.labels.length;
  } else if (stream === "label_corrections") {
    rows = input.label_corrections.map(stripIds);
    count = input.label_corrections.length;
  } else {
    rows = input.session_metrics;
    count = input.session_metrics ? 1 : 0;
  }
  return {
    manifest: {
      export_id: input.export_id,
      session_id: input.session.id,
      exported_at: input.exported_at,
      schema_version: 1,
      shape: "raw-stream",
      stream,
      table,
      sensor_source: SENSOR_SOURCES[table] ?? "unknown",
      row_count: count,
      rider_pseudonym: riderMap.get(input.session.rider_id) ?? "Rider-A",
      horse_pseudonym: horseMap.get(input.session.horse_id) ?? "Horse-A",
      activity_type: input.session.activity_type,
      start_time: input.session.start_time,
      end_time: input.session.end_time,
      algo_version: (input.session_metrics?.algo_version as string | undefined) ?? null,
    },
    rows,
  };
}

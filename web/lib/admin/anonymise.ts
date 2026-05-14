// Anonymises a session bundle for hand-off to the algorithm freelancer.
// Strips rider display_name + email and horse name; replaces ids with
// per-export pseudonyms (Rider-A, Horse-A, ...). Channel-specific:
// freelancer access policy says NEVER share horse.name, so this overrides
// the paper-export spec's "horses can stay named".

export type Prefix = "Rider" | "Horse";

export function buildPseudonymMap(ids: string[], prefix: Prefix): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const id of ids) {
    if (out.has(id)) continue;
    out.set(id, `${prefix}-${letterFor(i)}`);
    i += 1;
  }
  return out;
}

function letterFor(i: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export type RawSession = {
  id: string;
  rider_id: string;
  horse_id: string;
  activity_type: string;
  start_time: string;
  end_time: string | null;
  status: string;
};

export type RawSampleHr = {
  timestamp_ms: number;
  hr_bpm: number | null;
  rr_ms: number | null;
  contact: boolean | null;
};

export type RawLabelCorrection = {
  corrected_start_ms: number | null;
  corrected_end_ms: number | null;
  corrected_label_type: string | null;
  corrected_jump_count: number;
  auto_start_ms: number;
  auto_end_ms: number;
  auto_label_type: string;
  auto_jump_count: number;
  correction_kind: string;
  algo_version: string;
};

export type RawBundle = {
  session: RawSession;
  session_metrics: Record<string, unknown> | null;
  samples_hr: RawSampleHr[];
  label_corrections: RawLabelCorrection[];
  export_id: string;
  exported_at: string;
};

export type AnonymisedBundle = {
  manifest: {
    export_id: string;
    session_id: string;
    exported_at: string;
    schema_version: 1;
    algo_version: string | null;
  };
  session: {
    id: string;
    rider_pseudonym: string;
    horse_pseudonym: string;
    activity_type: string;
    started_at: string;
    end_time: string | null;
    duration_ms: number | null;
    status: string;
  };
  session_metrics: Record<string, unknown> | null;
  samples_hr: Array<{ t_ms: number; hr_bpm: number | null; rr_ms: number | null; contact: boolean | null }>;
  label_corrections: Array<{
    start_ms: number;
    end_ms: number;
    label: string;
    jump_count: number;
    correction_kind: string;
    algo_version: string;
  }>;
};

export function anonymiseBundle(input: RawBundle): AnonymisedBundle {
  const riderMap = buildPseudonymMap([input.session.rider_id], "Rider");
  const horseMap = buildPseudonymMap([input.session.horse_id], "Horse");
  const startMs = new Date(input.session.start_time).getTime();
  const endMs = input.session.end_time ? new Date(input.session.end_time).getTime() : null;
  return {
    manifest: {
      export_id: input.export_id,
      session_id: input.session.id,
      exported_at: input.exported_at,
      schema_version: 1,
      algo_version:
        (input.session_metrics?.algo_version as string | undefined) ?? null,
    },
    session: {
      id: input.session.id,
      rider_pseudonym: riderMap.get(input.session.rider_id) ?? "Rider-A",
      horse_pseudonym: horseMap.get(input.session.horse_id) ?? "Horse-A",
      activity_type: input.session.activity_type,
      started_at: input.session.start_time,
      end_time: input.session.end_time,
      duration_ms: endMs !== null ? endMs - startMs : null,
      status: input.session.status,
    },
    session_metrics: input.session_metrics,
    samples_hr: input.samples_hr.map((s) => ({
      t_ms: s.timestamp_ms,
      hr_bpm: s.hr_bpm,
      rr_ms: s.rr_ms,
      contact: s.contact,
    })),
    label_corrections: input.label_corrections.map((l) => ({
      start_ms: l.corrected_start_ms ?? l.auto_start_ms,
      end_ms: l.corrected_end_ms ?? l.auto_end_ms,
      label: l.corrected_label_type ?? l.auto_label_type,
      jump_count: l.corrected_jump_count,
      correction_kind: l.correction_kind,
      algo_version: l.algo_version,
    })),
  };
}

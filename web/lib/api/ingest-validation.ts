import { z } from "zod";

const HR_BPM_MIN = 20;
const HR_BPM_MAX = 250;
const RR_MS_MIN = 200;
const RR_MS_MAX = 3000;
const T_MS_MAX = Number.MAX_SAFE_INTEGER;
const MAX_HR_PER_BATCH = 2000;

// ±8 g at H10's millig scale = ±8000. Allow ±16000 to be permissive on the
// raw side; algo-side cleaning is where physiological filtering belongs.
const ACC_MG_MIN = -16000;
const ACC_MG_MAX = 16000;
const MAX_ACC_PER_BATCH = 4000; // 52 Hz × ~2 s flush, with margin

// 24-bit signed µV: ±8_388_608.
const ECG_UV_MIN = -8_388_608;
const ECG_UV_MAX = 8_388_607;
const MAX_ECG_PER_BATCH = 8000; // 130 Hz × ~2 s flush, with margin

export const hrSampleWire = z.object({
  t_ms: z.number().int().nonnegative().max(T_MS_MAX),
  hr_bpm: z.number().int().min(HR_BPM_MIN).max(HR_BPM_MAX),
  rr_ms: z.number().int().min(RR_MS_MIN).max(RR_MS_MAX).nullable(),
  contact: z.boolean().nullable(),
});

export const accSampleWire = z.object({
  t_ms: z.number().int().nonnegative().max(T_MS_MAX),
  ax_mg: z.number().int().min(ACC_MG_MIN).max(ACC_MG_MAX),
  ay_mg: z.number().int().min(ACC_MG_MIN).max(ACC_MG_MAX),
  az_mg: z.number().int().min(ACC_MG_MIN).max(ACC_MG_MAX),
});

export const ecgSampleWire = z.object({
  t_ms: z.number().int().nonnegative().max(T_MS_MAX),
  uv: z.number().int().min(ECG_UV_MIN).max(ECG_UV_MAX),
});

export const ingestSamplesBody = z.object({
  session_id: z.string().uuid(),
  samples: z.object({
    hr: z.array(hrSampleWire).max(MAX_HR_PER_BATCH).optional().default([]),
    acc: z.array(accSampleWire).max(MAX_ACC_PER_BATCH).optional().default([]),
    ecg: z.array(ecgSampleWire).max(MAX_ECG_PER_BATCH).optional().default([]),
  }),
});

export type HRSampleWire = z.infer<typeof hrSampleWire>;
export type AccSampleWire = z.infer<typeof accSampleWire>;
export type EcgSampleWire = z.infer<typeof ecgSampleWire>;
export type IngestSamplesBody = z.infer<typeof ingestSamplesBody>;

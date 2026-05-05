import { z } from "zod";

const HR_BPM_MIN = 20;
const HR_BPM_MAX = 250;
const RR_MS_MIN = 200;
const RR_MS_MAX = 3000;
const T_MS_MAX = Number.MAX_SAFE_INTEGER;
const MAX_HR_PER_BATCH = 2000;

export const hrSampleWire = z.object({
  t_ms: z.number().int().nonnegative().max(T_MS_MAX),
  hr_bpm: z.number().int().min(HR_BPM_MIN).max(HR_BPM_MAX),
  rr_ms: z.number().int().min(RR_MS_MIN).max(RR_MS_MAX).nullable(),
  contact: z.boolean().nullable(),
});

export const ingestSamplesBody = z.object({
  session_id: z.string().uuid(),
  samples: z.object({
    hr: z.array(hrSampleWire).max(MAX_HR_PER_BATCH),
  }),
});

export type HRSampleWire = z.infer<typeof hrSampleWire>;
export type IngestSamplesBody = z.infer<typeof ingestSamplesBody>;

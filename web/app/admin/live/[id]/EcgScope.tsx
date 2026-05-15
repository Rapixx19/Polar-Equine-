"use client";

import { useEffect, useRef } from "react";

type Sample = { ts_ms: number; uv: number };

// Canvas-based oscilloscope. Recharts can't keep up with 130 Hz × 4 s = 520
// points re-rendered every 1 s without dropping frames.
export function EcgScope({ samples, windowMs }: { samples: Sample[]; windowMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssW = cvs.clientWidth;
    const cssH = cvs.clientHeight;
    if (cvs.width !== cssW * dpr || cvs.height !== cssH * dpr) {
      cvs.width = cssW * dpr;
      cvs.height = cssH * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const surface = getCss("--surface", "#0a0a0a");
    const border = getCss("--border", "#262626");
    const text = getCss("--text-faint", "#6b7280");
    const lime = getCss("--lime", "#a3e635");

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssH / 2);
    ctx.lineTo(cssW, cssH / 2);
    ctx.stroke();

    if (samples.length < 2) {
      ctx.fillStyle = text;
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText("Waiting for ECG…", 12, cssH / 2 - 8);
      return;
    }

    const firstTs = samples[0].ts_ms;
    const lastTs = samples[samples.length - 1].ts_ms;
    const span = Math.max(1, Math.max(windowMs, lastTs - firstTs));
    let minUv = Infinity;
    let maxUv = -Infinity;
    for (const s of samples) {
      if (s.uv < minUv) minUv = s.uv;
      if (s.uv > maxUv) maxUv = s.uv;
    }
    if (!Number.isFinite(minUv) || !Number.isFinite(maxUv) || minUv === maxUv) {
      minUv = -1000;
      maxUv = 1000;
    }
    const range = maxUv - minUv;
    const pad = range * 0.15;
    const yMin = minUv - pad;
    const yMax = maxUv + pad;

    ctx.strokeStyle = lime;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const x = ((s.ts_ms - firstTs) / span) * cssW;
      const y = cssH - ((s.uv - yMin) / (yMax - yMin)) * cssH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillText(`${maxUv.toFixed(0)} µV`, 6, 12);
    ctx.fillText(`${minUv.toFixed(0)} µV`, 6, cssH - 4);
  }, [samples, windowMs]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <canvas ref={ref} className="block h-40 w-full" />
    </div>
  );
}

function getCss(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

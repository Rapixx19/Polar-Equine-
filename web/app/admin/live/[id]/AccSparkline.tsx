"use client";

import { useEffect, useRef } from "react";

type Point = { ts_ms: number; m: number };

// Tiny canvas sparkline for the ACC magnitude window. Used as a visual check
// that the rider is actually moving — flat line = horse standing or sensor
// dropping ACC frames silently. Pairs with the gait tile above it.
export function AccSparkline({ magnitudes, windowMs }: { magnitudes: Point[]; windowMs: number }) {
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
    const text = getCss("--text-faint", "#6b7280");
    const lime = getCss("--lime", "#a3e635");

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, cssW, cssH);

    if (magnitudes.length < 2) {
      ctx.fillStyle = text;
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText("Waiting for accelerometer…", 12, cssH / 2);
      return;
    }

    const firstTs = magnitudes[0].ts_ms;
    const lastTs = magnitudes[magnitudes.length - 1].ts_ms;
    const span = Math.max(1, Math.max(windowMs, lastTs - firstTs));
    let minM = Infinity;
    let maxM = -Infinity;
    for (const p of magnitudes) {
      if (p.m < minM) minM = p.m;
      if (p.m > maxM) maxM = p.m;
    }
    const pad = Math.max(0.05, (maxM - minM) * 0.1);
    const yMin = Math.max(0, minM - pad);
    const yMax = maxM + pad;

    ctx.strokeStyle = lime;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < magnitudes.length; i++) {
      const p = magnitudes[i];
      const x = ((p.ts_ms - firstTs) / span) * cssW;
      const y = cssH - ((p.m - yMin) / Math.max(1e-6, yMax - yMin)) * cssH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillText(`${maxM.toFixed(2)} g`, 6, 12);
    ctx.fillText(`${yMin.toFixed(2)} g`, 6, cssH - 4);
  }, [magnitudes, windowMs]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <canvas ref={ref} className="block h-24 w-full" />
    </div>
  );
}

function getCss(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

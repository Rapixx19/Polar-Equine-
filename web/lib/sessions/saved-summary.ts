import type { ActivityType } from "@/lib/activities";

export type SessionStatus = "active" | "completed" | "abandoned" | "approved";
export type MetricsStatus = "pending" | "computing" | "complete" | "failed";

export type SavedSession = {
  id: string;
  activity_type: ActivityType;
  start_time: string | null;
  end_time: string | null;
  status: SessionStatus;
  metrics_status: MetricsStatus;
  horse: { name: string } | null;
};

// What the /saved route should render. Three terminal cases:
//   - redirect: not viewable (active, abandoned, missing end_time, null session)
//   - analyzing: status='completed' but algo hasn't finished yet
//   - summary: ready to look at (metrics complete, or already approved)
//
// The 'analyzing' view polls and self-redirects to /review when ready —
// this dispatcher is just for the initial server render.
export type SavedView = "redirect" | "analyzing" | "summary";

export function savedView(session: SavedSession | null): SavedView {
  if (!session) return "redirect";
  if (!session.end_time) return "redirect";
  if (session.status === "active" || session.status === "abandoned") return "redirect";

  // Approved sessions always show the read-only summary (rider already labeled).
  if (session.status === "approved") return "summary";

  // Completed sessions: gate on metrics_status so the rider sees a loader
  // instead of an empty/half-baked summary while the algo is still running.
  if (session.metrics_status === "complete" || session.metrics_status === "failed") {
    return "summary";
  }
  return "analyzing";
}

export function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

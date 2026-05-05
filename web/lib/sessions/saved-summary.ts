import type { ActivityType } from "@/lib/activities";

export type SavedSession = {
  id: string;
  activity_type: ActivityType;
  start_time: string | null;
  end_time: string | null;
  status: "active" | "completed" | "cancelled";
  horse: { name: string } | null;
};

export function shouldRedirectFromSaved(session: SavedSession | null): boolean {
  if (!session) return true;
  if (session.status !== "completed") return true;
  if (!session.end_time) return true;
  return false;
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

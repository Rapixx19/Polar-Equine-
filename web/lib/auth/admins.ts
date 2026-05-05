import { env } from "@/lib/env";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = env.ADMIN_EMAILS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return list.includes(email.toLowerCase());
}

import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { assertAdmin, createServerSupabaseClient } from "@/lib/auth/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { profile } = await assertAdmin(supabase);
  return <AdminShell displayName={profile.display_name}>{children}</AdminShell>;
}

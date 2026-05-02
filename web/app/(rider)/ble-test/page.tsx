import { redirect } from "next/navigation";

import { BleTestPanel } from "@/components/ble/BleTestPanel";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export default async function BleTestPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  // RLS-filtered: only horses the rider has been granted via horse_riders.
  // Seed UUIDs aren't pinned in 006_seed.sql, so we resolve them at render
  // time. Slice 7 replaces this with a dedicated /api/horses route.
  const { data: horses } = await supabase
    .from("horses")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <main className="flex min-h-screen items-start justify-center bg-stone-50 p-6 text-stone-900">
      <BleTestPanel horses={horses ?? []} />
    </main>
  );
}

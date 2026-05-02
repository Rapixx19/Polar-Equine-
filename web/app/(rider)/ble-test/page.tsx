import { redirect } from "next/navigation";

import { BleTestPanel } from "@/components/ble/BleTestPanel";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export default async function BleTestPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-stone-50 p-6 text-stone-900">
      <BleTestPanel />
    </main>
  );
}

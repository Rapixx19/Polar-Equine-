import { redirect } from "next/navigation";

import { BleTestPanel } from "@/components/ble/BleTestPanel";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { getHorsesForRider } from "@/lib/horses/server";

export default async function BleTestPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const horses = await getHorsesForRider(supabase);

  return (
    <main className="flex min-h-screen items-start justify-center p-6">
      <BleTestPanel horses={horses} />
    </main>
  );
}

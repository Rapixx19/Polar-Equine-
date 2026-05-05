import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { ProvisionForm } from "@/components/auth/ProvisionForm";

export default async function ProvisionPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const { data: existing } = await supabase
    .from("rider_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-2xl font-light">Almost done.</h1>
        <p className="mb-8 text-stone-600">
          Pick a display name. You can change it later.
        </p>
        <ProvisionForm />
      </div>
    </main>
  );
}

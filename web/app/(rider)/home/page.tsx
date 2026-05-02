import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("display_name, is_admin, consented_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/auth/provision");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-sm text-stone-500">Signed in as</p>
        <h1 className="mb-1 text-2xl font-light">{profile.display_name}</h1>
        {profile.is_admin && (
          <p className="mb-2 text-xs uppercase tracking-wide text-amber-700">Admin</p>
        )}
        <p className="mb-8 text-sm text-stone-500">
          Home screen lands in Slice 7. For now, this confirms your session works.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}

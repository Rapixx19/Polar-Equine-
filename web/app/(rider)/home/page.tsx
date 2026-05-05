import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { ActivityTile } from "@/components/session/ActivityTile";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/auth/provision");
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 text-stone-900">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6">
          <p className="text-sm text-stone-500">Hello,</p>
          <h1 className="text-2xl font-light">{profile.display_name}</h1>
          {profile.is_admin && (
            <p className="mt-1 text-xs uppercase tracking-wide text-amber-700">Admin</p>
          )}
        </header>

        <h2 className="mb-3 text-sm font-medium text-stone-600">What is this horse doing?</h2>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITY_TYPES.map((activity) => (
            <ActivityTile key={activity} activity={activity} />
          ))}
        </div>

        <footer className="mt-10 flex justify-center">
          <LogoutButton />
        </footer>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

type SearchParams = Promise<{ code?: string; error?: string; error_description?: string }>;

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (params.error) {
    redirect("/auth/error");
  }

  const supabase = await createServerSupabaseClient();

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      redirect("/auth/error");
    }
  }

  const user = await getUser(supabase);
  if (!user) {
    redirect("/auth/error");
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/auth/provision");
  }
  redirect("/home");
}

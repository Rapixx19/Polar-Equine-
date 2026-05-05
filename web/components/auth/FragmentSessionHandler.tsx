"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/auth/browser";

// Slice 10 smoke-test helper. Magic-link emails triggered via the GoTrue
// /auth/v1/otp endpoint without a PKCE code_challenge return tokens in the
// URL fragment after verification. Server Components can't read fragments,
// so this client component picks them up, hands them to the browser
// Supabase client (which writes the session cookies), and forwards to /home.
export function FragmentSessionHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createBrowserSupabaseClient();
    void supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          window.location.replace("/auth/error");
          return;
        }
        window.location.hash = "";
        router.replace("/home");
        router.refresh();
      });
  }, [router]);

  return null;
}

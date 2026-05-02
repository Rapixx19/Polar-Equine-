function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  get ALGO_BASE_URL(): string {
    return required("ALGO_BASE_URL");
  },
  get ALGO_BEARER_TOKEN(): string {
    return required("ALGO_BEARER_TOKEN");
  },
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get NEXT_PUBLIC_APP_URL(): string {
    return required("NEXT_PUBLIC_APP_URL");
  },
  get ADMIN_EMAILS(): string {
    return required("ADMIN_EMAILS");
  },
} as const;

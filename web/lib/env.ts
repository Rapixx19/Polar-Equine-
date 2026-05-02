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
} as const;

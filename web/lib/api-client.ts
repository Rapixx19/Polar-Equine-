import { env } from "@/lib/env";

export async function algoFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${env.ALGO_BASE_URL}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${env.ALGO_BEARER_TOKEN}`,
    },
  });
}

// Pure helpers for the admin-subdomain proxy. Tested independently in
// `tests/admin-host.test.ts`; the Next.js `proxy.ts` entry just calls these.

const PASSTHROUGH_PREFIXES = ["/admin", "/api", "/auth", "/_next"];
const PASSTHROUGH_EXACT = new Set(["/", "/home"]);

export function isAdminHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  return lower.startsWith("admin.") || lower.startsWith("admin-");
}

// On the admin subdomain we want short URLs like `/sessions/123` to render the
// same page as `/admin/sessions/123` on the main domain. Sign-in (/), rider
// home (/home), auth flows (/auth/*), API routes (/api/*), and Next internals
// pass through unchanged so the auth chain doesn't loop.
export function rewriteForAdminHost(
  host: string | null | undefined,
  pathname: string,
): string | null {
  if (!isAdminHost(host)) return null;
  if (PASSTHROUGH_EXACT.has(pathname)) return null;
  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return null;
  }
  return `/admin${pathname}`;
}

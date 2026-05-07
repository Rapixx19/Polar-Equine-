import { describe, it, expect } from "vitest";

import { isAdminHost, rewriteForAdminHost } from "@/lib/proxy/admin-host";

describe("isAdminHost", () => {
  it.each([
    ["admin.sentavita.app", true],
    ["admin.localhost:3000", true],
    ["admin-staging.sentavita.app", true],
    ["ADMIN.sentavita.app", true],
    ["sentavita.app", false],
    ["localhost:3000", false],
    ["adminish.sentavita.app", false],
    ["sub.admin.sentavita.app", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%s → %s", (host, expected) => {
    expect(isAdminHost(host)).toBe(expected);
  });
});

describe("rewriteForAdminHost", () => {
  const HOST = "admin.sentavita.app";

  it("returns null on non-admin host", () => {
    expect(rewriteForAdminHost("sentavita.app", "/sessions")).toBeNull();
  });

  it.each(["/", "/home", "/admin", "/admin/sessions/abc", "/api/sessions", "/auth/callback", "/_next/static/foo"])(
    "passes through %s on admin host",
    (path) => {
      expect(rewriteForAdminHost(HOST, path)).toBeNull();
    },
  );

  it.each([
    ["/sessions", "/admin/sessions"],
    ["/sessions/abc-123", "/admin/sessions/abc-123"],
    ["/horses", "/admin/horses"],
    ["/horses/uuid-here", "/admin/horses/uuid-here"],
    ["/jobs", "/admin/jobs"],
  ])("rewrites %s → %s on admin host", (input, expected) => {
    expect(rewriteForAdminHost(HOST, input)).toBe(expected);
  });

  it("does not double-prefix paths starting with /admin", () => {
    expect(rewriteForAdminHost(HOST, "/admin/sessions")).toBeNull();
  });

  it("treats /api as a prefix, not an exact match", () => {
    expect(rewriteForAdminHost(HOST, "/apiology")).toBe("/admin/apiology");
  });
});

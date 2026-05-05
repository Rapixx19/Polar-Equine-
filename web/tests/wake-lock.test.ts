import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireWakeLock, releaseWakeLock, resetWakeLockForTests, type WakeLockHandle } from "@/lib/ble/wake-lock";
import { installMockWakeLock } from "./helpers/wake-lock-mock";

// Deterministic async helpers — replace fragile multi-microtask awaits.
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor(predicate: () => boolean, timeoutMs: number, stepMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(stepMs);
  }
  if (!predicate()) throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}

describe("wake-lock", () => {
  let env: ReturnType<typeof installMockWakeLock>;

  beforeEach(() => {
    env = installMockWakeLock();
  });

  afterEach(() => {
    // Module-level state in wake-lock.ts persists across tests; reset before
    // tearing down the mocked navigator so the next test starts clean.
    resetWakeLockForTests();
    env.uninstall();
  });

  it("acquire returns a handle and bumps the underlying request count", async () => {
    const handle = await acquireWakeLock(() => true);
    expect(handle).not.toBeNull();
    expect(env.wakeLock.requestCallCount()).toBe(1);
  });

  it("acquire is idempotent while a sentinel is held", async () => {
    const a = await acquireWakeLock(() => true);
    const b = await acquireWakeLock(() => true);
    expect(env.wakeLock.requestCallCount()).toBe(1);
    expect(a).toBe(b);
  });

  it("re-acquires when the sentinel fires release while a session is active", async () => {
    const handle = await acquireWakeLock(() => true);
    expect(handle).not.toBeNull();
    expect(env.wakeLock.requestCallCount()).toBe(1);
    env.lastSentinel()?.fireRelease();
    // Re-acquire is async (the listener calls acquireWakeLock which awaits
    // navigator.wakeLock.request). Poll until either the count reaches 2 or
    // a hard 100ms ceiling. This is deterministic regardless of how many
    // microtasks are in the implementation's promise chain.
    await waitFor(() => env.wakeLock.requestCallCount() === 2, 100);
    expect(env.wakeLock.requestCallCount()).toBe(2);
  });

  it("does NOT re-acquire on sentinel release when session is inactive", async () => {
    let active = true;
    await acquireWakeLock(() => active);
    active = false;
    env.lastSentinel()?.fireRelease();
    // Give the listener a generous window to (incorrectly) re-acquire.
    // 50ms is well above any single-promise-chain microtask depth.
    await sleep(50);
    expect(env.wakeLock.requestCallCount()).toBe(1);
  });

  it("releaseWakeLock releases the held sentinel and clears the handle", async () => {
    await acquireWakeLock(() => true);
    await releaseWakeLock();
    expect(env.lastSentinel()?.released).toBe(true);
  });

  it("acquire returns null when navigator.wakeLock is missing (graceful no-op)", async () => {
    env.uninstall();
    // Re-install a navigator without wakeLock — defineProperty because Node
    // 21+ ships navigator as a getter-only built-in (direct assignment fails).
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });
    const handle: WakeLockHandle | null = await acquireWakeLock(() => true);
    expect(handle).toBeNull();
  });
});

type ReleaseListener = () => void;

export type MockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  fireRelease: () => void;            // test-only: simulate OS-level release
  addEventListener: (event: "release", listener: ReleaseListener) => void;
  removeEventListener: (event: "release", listener: ReleaseListener) => void;
};

export type MockWakeLock = {
  request: (type: "screen") => Promise<MockSentinel>;
  requestCallCount: () => number;
};

export function createMockWakeLock(): { wakeLock: MockWakeLock; lastSentinel: () => MockSentinel | null } {
  let sentinel: MockSentinel | null = null;
  let calls = 0;
  const wakeLock: MockWakeLock = {
    async request(_type) {
      calls++;
      const listeners: ReleaseListener[] = [];
      sentinel = {
        released: false,
        async release() {
          this.released = true;
          for (const l of listeners) l();
        },
        fireRelease() {
          this.released = true;
          for (const l of listeners) l();
        },
        addEventListener(_event, listener) {
          listeners.push(listener);
        },
        removeEventListener(_event, listener) {
          const i = listeners.indexOf(listener);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
      return sentinel;
    },
    requestCallCount() {
      return calls;
    },
  };
  return { wakeLock, lastSentinel: () => sentinel };
}

// Install on globalThis.navigator. vitest's node env has no navigator —
// we attach an ad-hoc one. uninstall() restores prior state for test isolation.
export function installMockWakeLock(): {
  wakeLock: MockWakeLock;
  lastSentinel: () => MockSentinel | null;
  uninstall: () => void;
} {
  const { wakeLock, lastSentinel } = createMockWakeLock();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  const priorNav = g.navigator;
  g.navigator = { ...(priorNav ?? {}), wakeLock };
  return {
    wakeLock,
    lastSentinel,
    uninstall: () => {
      g.navigator = priorNav;
    },
  };
}

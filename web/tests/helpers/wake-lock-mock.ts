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

// Install on globalThis.navigator. Node 21+ ships `navigator` as a built-in
// global with a getter-only property descriptor, so direct assignment fails
// with "Cannot set property navigator of #<Object> which has only a getter".
// Use Object.defineProperty to override; uninstall() restores prior state.
export function installMockWakeLock(): {
  wakeLock: MockWakeLock;
  lastSentinel: () => MockSentinel | null;
  uninstall: () => void;
} {
  const { wakeLock, lastSentinel } = createMockWakeLock();
  const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priorNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { ...(priorNav ?? {}), wakeLock },
    configurable: true,
    writable: true,
  });
  return {
    wakeLock,
    lastSentinel,
    uninstall: () => {
      if (priorDescriptor) {
        Object.defineProperty(globalThis, "navigator", priorDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).navigator;
      }
    },
  };
}

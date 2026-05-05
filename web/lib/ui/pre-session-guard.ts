const IOS_UA_RE = /iPad|iPhone|iPod/;

export function isIosUserAgent(ua: string): boolean {
  return IOS_UA_RE.test(ua);
}

export type GuardInput = { userAgent: string; dismissed: boolean };

export function shouldShowGuard({ userAgent, dismissed }: GuardInput): boolean {
  if (dismissed) return false;
  return isIosUserAgent(userAgent);
}

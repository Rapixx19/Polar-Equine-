const IOS_UA_RE = /iPad|iPhone|iPod/;
const ANDROID_UA_RE = /Android/;

export function isIosUserAgent(ua: string): boolean {
  return IOS_UA_RE.test(ua);
}

export function isAndroidUserAgent(ua: string): boolean {
  return ANDROID_UA_RE.test(ua);
}

export type GuardPlatform = "ios" | "android" | null;
export type GuardInput = { userAgent: string; dismissed: boolean };

export function shouldShowGuard({ userAgent, dismissed }: GuardInput): GuardPlatform {
  if (dismissed) return null;
  if (isIosUserAgent(userAgent)) return "ios";
  if (isAndroidUserAgent(userAgent)) return "android";
  return null;
}

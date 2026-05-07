// Translates POST /api/sessions failure shapes into a rider-facing message.
// Pure so it can be tested without mocking fetch. The hook owns transport,
// this owns wording.

export type StartErrorCode =
  | "horse_already_active"
  | "forbidden"
  | "unauthorized"
  | "invalid_request"
  | "create_failed"
  | "network"
  | "unknown";

export function classifyStartError(
  status: number | null,
  errorCode: string | null | undefined,
): StartErrorCode {
  if (status === null) return "network";
  if (errorCode === "horse_already_active") return "horse_already_active";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid_request";
  if (status === 409) return "horse_already_active";
  if (status >= 500) return "create_failed";
  return "unknown";
}

export function startErrorMessage(code: StartErrorCode): string {
  switch (code) {
    case "horse_already_active":
      return "This horse already has a session running. Ask the other rider to end it, or pick a different horse.";
    case "forbidden":
      return "You're not assigned to this horse. Ask an admin to add you.";
    case "unauthorized":
      return "Your session expired. Sign in again.";
    case "invalid_request":
      return "Couldn't start session — invalid request. Refresh and try again.";
    case "create_failed":
      return "Server error starting the session. Wait a moment and try again.";
    case "network":
      return "No network — couldn't reach the server. Check your connection and try again.";
    case "unknown":
      return "Couldn't start session. Try again.";
  }
}

export type AuthErrorShape = {
  code?: string;
  name?: string;
  status?: number;
};

export type LoginErrorKind =
  | "invalid_credentials"
  | "rate_limited"
  | "unavailable";

export type MfaErrorKind = "invalid_code" | "rate_limited" | "unavailable";

export function isRateLimited(error: AuthErrorShape | null | undefined) {
  return (
    error?.status === 429 ||
    error?.code === "over_request_rate_limit" ||
    error?.code === "over_email_send_rate_limit"
  );
}

export function isTemporarilyUnavailable(
  error: AuthErrorShape | null | undefined,
) {
  return (
    error?.name === "AuthRetryableFetchError" ||
    error?.status === 0 ||
    (typeof error?.status === "number" && error.status >= 500) ||
    error?.code === "request_timeout" ||
    error?.code === "unexpected_failure"
  );
}

export function classifyLoginError(
  error: AuthErrorShape | null | undefined,
): LoginErrorKind {
  if (isRateLimited(error)) return "rate_limited";
  if (error?.code === "invalid_credentials") return "invalid_credentials";
  return "unavailable";
}

export function classifyMfaError(
  error: AuthErrorShape | null | undefined,
): MfaErrorKind {
  if (isRateLimited(error)) return "rate_limited";
  if (isTemporarilyUnavailable(error)) return "unavailable";
  return "invalid_code";
}

import "server-only";

export class DataAccessError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "unauthenticated"
      | "unauthorized"
      | "unavailable"
      | "rate_limited"
      | "not_found"
      | "invalid_input",
  ) {
    super("The requested operation could not be completed.");
    this.name = "DataAccessError";
  }
}

export function classifyDatabaseError(error: {
  code?: string;
  status?: number;
}): "unauthorized" | "rate_limited" | "unavailable" {
  if (error.status === 429) return "rate_limited";
  if (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    error.code === "PGRST302"
  ) {
    return "unauthorized";
  }
  return "unavailable";
}

import "server-only";

export class DataAccessError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "unauthenticated"
      | "unauthorized"
      | "not_found"
      | "invalid_input",
  ) {
    super("The requested operation could not be completed.");
    this.name = "DataAccessError";
  }
}

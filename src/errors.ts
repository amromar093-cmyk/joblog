/** A known, expected failure (bad input, no auth, not yours, not found) —
 *  as opposed to a genuine bug, which should surface as an unhandled 500. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const badRequest = (msg: string) => new ApiError(400, msg);
export const unauthorized = (msg = "Sign in required.") => new ApiError(401, msg);
export const forbidden = (msg = "Not yours to change.") => new ApiError(403, msg);
export const notFound = (msg = "Not found.") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);
export const serviceUnavailable = (msg: string) => new ApiError(503, msg);

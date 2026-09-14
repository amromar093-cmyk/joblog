import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors";

/** Must be registered last. Express recognizes it as an error handler purely
 *  by its 4-argument signature — dropping any of the four breaks that. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
}

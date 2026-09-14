import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./jwt";
import { unauthorized } from "../errors";

// Augment Express's Request so every downstream handler gets `req.userId`
// typed, instead of everyone casting `req as any` themselves.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized());

  const payload = verifyToken(token);
  if (!payload) return next(unauthorized("Your session has expired. Sign in again."));

  req.userId = payload.userId;
  next();
}

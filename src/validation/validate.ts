import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { badRequest } from "../errors";

/** Parses `req.body` against `schema`, replaces it with the parsed (and
 *  coerced/trimmed/defaulted) value, or fails with a 400 that names exactly
 *  which field was wrong — never a raw Zod stack trace reaching the client. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(badRequest(`${first.path.join(".") || "body"}: ${first.message}`));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(badRequest(`${first.path.join(".") || "query"}: ${first.message}`));
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}

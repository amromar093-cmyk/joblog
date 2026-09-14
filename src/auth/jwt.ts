import jwt from "jsonwebtoken";
import { env } from "../env";

export type TokenPayload = { userId: string };

const EXPIRES_IN = "7d";

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

/** Returns the payload for a valid token, or null for anything else —
 *  expired, tampered, wrong secret, malformed. Callers turn null into a 401;
 *  they never need to know *why* a token failed. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "object" && decoded && typeof (decoded as any).userId === "string") {
      return { userId: (decoded as any).userId };
    }
    return null;
  } catch {
    return null;
  }
}

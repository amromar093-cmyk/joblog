import { z } from "zod";

/** Fail fast and loud if required config is missing, instead of a confusing
 *  crash three requests later when someone finally touches the DB or signs
 *  a JWT. */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Optional on purpose — the AI routes 503 with a clear message if these
  // are missing (see src/ai/*), but their absence must never block boot or
  // break `npm test`/CI, which has no reason to hold paid API keys.
  ANTHROPIC_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);

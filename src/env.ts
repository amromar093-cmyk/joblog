import { z } from "zod";

/** Fail fast and loud if required config is missing, instead of a confusing
 *  crash three requests later when someone finally touches the DB or signs
 *  a JWT. */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = schema.parse(process.env);

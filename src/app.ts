import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { applicationsRouter } from "./routes/applications.routes";
import { resumeRouter } from "./routes/resume.routes";
import { errorHandler } from "./errorHandler";

/** Built as a plain factory (not a side-effecting module-level `app`) so
 *  tests can spin up as many independent instances as they want and hit them
 *  directly with supertest — no real port, no server to tear down. */
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/resume", resumeRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(errorHandler);
  return app;
}

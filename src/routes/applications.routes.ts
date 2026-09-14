import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import {
  addEventSchema,
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "../validation/schemas";
import { validateBody, validateQuery } from "../validation/validate";
import { notFound } from "../errors";

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/** Loads the application if it exists AND belongs to the caller — the two
 *  are checked together on purpose. Returning 404 (not 403) when it belongs
 *  to someone else means a caller can't probe for which ids exist. */
async function loadOwnedApplication(id: string, userId: string) {
  const app = await prisma.application.findFirst({ where: { id, userId } });
  if (!app) throw notFound("No application with that id.");
  return app;
}

applicationsRouter.get("/", validateQuery(listApplicationsQuerySchema), async (req, res, next) => {
  try {
    const { status } = (req as any).validatedQuery as { status?: string };
    const apps = await prisma.application.findMany({
      where: { userId: req.userId!, ...(status ? { status: status as any } : {}) },
      orderBy: { appliedAt: "desc" },
    });
    res.json({ applications: apps });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/", validateBody(createApplicationSchema), async (req, res, next) => {
  try {
    const app = await prisma.application.create({
      data: { ...req.body, url: req.body.url || null, userId: req.userId! },
    });
    res.status(201).json({ application: app });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.get("/:id", async (req, res, next) => {
  try {
    const app = await loadOwnedApplication(req.params.id, req.userId!);
    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ application: app, events });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.patch("/:id", validateBody(updateApplicationSchema), async (req, res, next) => {
  try {
    // a plain :id segment is always a single string at runtime; the union
    // with string[] only exists for repeatable path-to-regexp modifiers
    // (":id+" etc.), which this route doesn't use
    const existing = await loadOwnedApplication(req.params.id as string, req.userId!);
    const patch = { ...req.body };
    if ("url" in patch) patch.url = patch.url || null;

    const updated = await prisma.$transaction(async (tx) => {
      const app = await tx.application.update({ where: { id: existing.id }, data: patch });
      // A status change is the one edit worth its own timeline entry — it's
      // the thing you actually want a history of when you look back at why
      // an application went quiet.
      if (patch.status && patch.status !== existing.status) {
        await tx.applicationEvent.create({
          data: { applicationId: app.id, note: `Status changed: ${existing.status} → ${patch.status}` },
        });
      }
      return app;
    });
    res.json({ application: updated });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await loadOwnedApplication(req.params.id, req.userId!);
    await prisma.application.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/:id/events", validateBody(addEventSchema), async (req, res, next) => {
  try {
    const existing = await loadOwnedApplication(req.params.id as string, req.userId!);
    const event = await prisma.applicationEvent.create({
      data: { applicationId: existing.id, note: req.body.note },
    });
    res.status(201).json({ event });
  } catch (err) {
    next(err);
  }
});

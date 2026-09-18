import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import {
  addEventSchema,
  createApplicationSchema,
  listApplicationsQuerySchema,
  matchApplicationSchema,
  updateApplicationSchema,
} from "../validation/schemas";
import { validateBody, validateQuery } from "../validation/validate";
import { badRequest, notFound } from "../errors";
import { extractSkills, draftCoverLetter } from "../ai/claude";
import { embed, embedOne } from "../ai/embeddings";
import { computeMatchScore, matchSkillsAgainstBullets } from "../lib/matching";
import { rankBySimilarity } from "../lib/similarity";

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

/** Scores this application's fit against a pasted job description: Claude
 *  extracts the concrete skills/requirements (structured output, not prose
 *  parsing), each is embedded, and matched against the caller's resume
 *  bullets by cosine similarity. The job description and result are saved
 *  on the application — the cover-letter agent below reuses both. */
applicationsRouter.post("/:id/match", validateBody(matchApplicationSchema), async (req, res, next) => {
  try {
    const existing = await loadOwnedApplication(req.params.id as string, req.userId!);
    const bullets = await prisma.resumeBullet.findMany({ where: { userId: req.userId! } });
    if (bullets.length === 0) throw badRequest("Add at least one resume bullet before matching a job description.");

    const { jobDescription } = req.body as { jobDescription: string };
    const { required, preferred } = await extractSkills(jobDescription);
    if (required.length === 0 && preferred.length === 0) {
      throw badRequest("Couldn't find any concrete skills in that job description — try pasting the full posting.");
    }

    const allEmbeddings = await embed([...required, ...preferred]);
    const requiredWithEmb = required.map((text, i) => ({ text, embedding: allEmbeddings[i] }));
    const preferredWithEmb = preferred.map((text, i) => ({ text, embedding: allEmbeddings[required.length + i] }));

    const requiredResults = matchSkillsAgainstBullets(requiredWithEmb, bullets);
    const preferredResults = matchSkillsAgainstBullets(preferredWithEmb, bullets);
    const matchScore = computeMatchScore(requiredResults, preferredResults);
    const all = [...requiredResults, ...preferredResults];

    const updated = await prisma.application.update({
      where: { id: existing.id },
      data: {
        jobDescription,
        matchScore,
        matchedSkills: all.filter((s) => s.matched).map((s) => s.text),
        missingSkills: all.filter((s) => !s.matched).map((s) => s.text),
      },
    });
    res.json({ application: updated, required: requiredResults, preferred: preferredResults });
  } catch (err) {
    next(err);
  }
});

/** Drafts a cover letter with a real tool-use agent loop (see
 *  src/ai/claude.ts): the model decides what to search for in the caller's
 *  resume and can only cite bullets it actually retrieved. Its self-reported
 *  citations are still filtered against real bullet ids below — a claim
 *  from the model, not a guarantee. */
applicationsRouter.post("/:id/cover-letter", async (req, res, next) => {
  try {
    const existing = await loadOwnedApplication(req.params.id as string, req.userId!);
    const bullets = await prisma.resumeBullet.findMany({ where: { userId: req.userId! } });
    if (bullets.length === 0) throw badRequest("Add at least one resume bullet before drafting a cover letter.");

    const { letter, citedBulletIds } = await draftCoverLetter({
      company: existing.company,
      role: existing.role,
      jobDescription: existing.jobDescription,
      searchBullets: async (query) => {
        const queryEmbedding = await embedOne(query);
        return rankBySimilarity(queryEmbedding, bullets)
          .slice(0, 5)
          .map((b) => ({ id: b.id, text: b.text }));
      },
    });

    const validIds = new Set(bullets.map((b) => b.id));
    const coverBulletIds = citedBulletIds.filter((id) => validIds.has(id));

    const updated = await prisma.application.update({
      where: { id: existing.id },
      data: { coverLetter: letter, coverBulletIds },
    });
    res.json({ application: updated });
  } catch (err) {
    next(err);
  }
});

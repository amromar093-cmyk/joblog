import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth/middleware";
import { addResumeBulletSchema } from "../validation/schemas";
import { validateBody } from "../validation/validate";
import { notFound } from "../errors";
import { embedOne } from "../ai/embeddings";

export const resumeRouter = Router();
resumeRouter.use(requireAuth);

// Embeddings never leave this router — nothing downstream should have to
// know a bullet even has one.
const publicBullet = (b: { id: string; text: string; createdAt: Date }) => ({ id: b.id, text: b.text, createdAt: b.createdAt });

resumeRouter.get("/bullets", async (req, res, next) => {
  try {
    const bullets = await prisma.resumeBullet.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "asc" },
    });
    res.json({ bullets: bullets.map(publicBullet) });
  } catch (err) {
    next(err);
  }
});

resumeRouter.post("/bullets", validateBody(addResumeBulletSchema), async (req, res, next) => {
  try {
    const embedding = await embedOne(req.body.text);
    const bullet = await prisma.resumeBullet.create({
      data: { userId: req.userId!, text: req.body.text, embedding },
    });
    res.status(201).json({ bullet: publicBullet(bullet) });
  } catch (err) {
    next(err);
  }
});

resumeRouter.delete("/bullets/:id", async (req, res, next) => {
  try {
    const existing = await prisma.resumeBullet.findFirst({ where: { id: req.params.id, userId: req.userId! } });
    if (!existing) throw notFound("No resume bullet with that id.");
    await prisma.resumeBullet.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

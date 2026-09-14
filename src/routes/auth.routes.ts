import { Router } from "express";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../auth/hash";
import { signToken } from "../auth/jwt";
import { requireAuth } from "../auth/middleware";
import { loginSchema, registerSchema } from "../validation/schemas";
import { validateBody } from "../validation/validate";
import { conflict, unauthorized } from "../errors";

export const authRouter = Router();

function publicUser(u: { id: string; email: string; fullName: string }) {
  return { id: u.id, email: u.email, fullName: u.fullName };
}

authRouter.post("/register", validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return next(conflict("An account with that email already exists."));

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash, fullName } });
    const token = signToken({ userId: user.id });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // Same error for "no such user" and "wrong password" — confirming which
    // one it was would let an attacker enumerate registered emails.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return next(unauthorized("Incorrect email or password."));
    }
    const token = signToken({ userId: user.id });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return next(unauthorized());
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

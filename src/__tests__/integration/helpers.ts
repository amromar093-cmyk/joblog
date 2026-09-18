import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db";

export const app = createApp();

export async function resetDb() {
  await prisma.applicationEvent.deleteMany();
  await prisma.application.deleteMany();
  await prisma.resumeBullet.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;

/** Registers a fresh user and returns their auth token + id — most tests
 *  just need "a logged-in user", not the specifics of how they got that way. */
export async function registerUser(overrides?: { email?: string; password?: string; fullName?: string }) {
  counter += 1;
  const email = overrides?.email ?? `user${counter}@example.com`;
  const password = overrides?.password ?? "longenough1";
  const fullName = overrides?.fullName ?? `Test User ${counter}`;

  const res = await request(app).post("/api/auth/register").send({ email, password, fullName });
  if (res.status !== 201) throw new Error(`registerUser setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, userId: res.body.user.id as string, email, password };
}

export function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

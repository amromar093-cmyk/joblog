import request from "supertest";
import { prisma } from "../../db";
import { app, authed, registerUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => prisma.$disconnect());

describe("POST /api/auth/register", () => {
  it("creates an account and returns a usable token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "amr@example.com", password: "longenough1", fullName: "Amr" });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(String), email: "amr@example.com", fullName: "Amr" });
  });

  it("never echoes the password or the password hash back", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "amr@example.com", password: "longenough1", fullName: "Amr" });
    expect(JSON.stringify(res.body)).not.toMatch(/longenough1|passwordHash/i);
  });

  it("rejects a duplicate email with 409, not a 500", async () => {
    await registerUser({ email: "dup@example.com" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dup@example.com", password: "longenough1", fullName: "Someone Else" });
    expect(res.status).toBe(409);
  });

  it("rejects an invalid payload with 400 and a specific message, before touching the DB", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email", password: "short", fullName: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the right credentials", async () => {
    const { email, password } = await registerUser({ email: "login@example.com" });
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("rejects the wrong password with 401", async () => {
    const { email } = await registerUser({ email: "login2@example.com" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "totally-wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects an email that was never registered, with the same 401 as a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "whatever1" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user for a valid token", async () => {
    const { token, email } = await registerUser({ email: "me@example.com" });
    const res = await request(app).get("/api/auth/me").set(authed(token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it("rejects with 401 when there's no token at all", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects with 401 for a garbage token", async () => {
    const res = await request(app).get("/api/auth/me").set(authed("garbage.token.value"));
    expect(res.status).toBe(401);
  });
});

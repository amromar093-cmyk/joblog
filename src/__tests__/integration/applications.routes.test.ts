import request from "supertest";
import { prisma } from "../../db";
import { app, authed, registerUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => prisma.$disconnect());

describe("application CRUD", () => {
  it("creates an application scoped to the signed-in user, defaulting status to APPLIED", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/applications")
      .set(authed(token))
      .send({ company: "Acme", role: "Junior React Native Dev" });

    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({ company: "Acme", role: "Junior React Native Dev", status: "APPLIED" });
  });

  it("rejects creating one with no auth token at all", async () => {
    const res = await request(app).post("/api/applications").send({ company: "Acme", role: "Dev" });
    expect(res.status).toBe(401);
  });

  it("rejects a payload missing the required fields", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme" });
    expect(res.status).toBe(400);
  });

  it("lists only the signed-in user's own applications — not another user's", async () => {
    const a = await registerUser();
    const b = await registerUser();
    await request(app).post("/api/applications").set(authed(a.token)).send({ company: "A-Corp", role: "Dev" });
    await request(app).post("/api/applications").set(authed(b.token)).send({ company: "B-Corp", role: "Dev" });

    const listA = await request(app).get("/api/applications").set(authed(a.token));
    expect(listA.body.applications).toHaveLength(1);
    expect(listA.body.applications[0].company).toBe("A-Corp");
  });

  it("filters the list by status", async () => {
    const { token } = await registerUser();
    await request(app).post("/api/applications").set(authed(token)).send({ company: "X", role: "Dev", status: "APPLIED" });
    await request(app).post("/api/applications").set(authed(token)).send({ company: "Y", role: "Dev", status: "OFFER" });

    const res = await request(app).get("/api/applications?status=OFFER").set(authed(token));
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].company).toBe("Y");
  });

  it("404s fetching another user's application by id — not 403, so ids can't be probed", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(owner.token)).send({ company: "Acme", role: "Dev" });

    const res = await request(app).get(`/api/applications/${created.body.application.id}`).set(authed(intruder.token));
    expect(res.status).toBe(404);
  });

  it("404s patching or deleting another user's application", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(owner.token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;

    const patch = await request(app).patch(`/api/applications/${id}`).set(authed(intruder.token)).send({ status: "OFFER" });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/applications/${id}`).set(authed(intruder.token));
    expect(del.status).toBe(404);

    // and it's untouched, from the real owner's point of view
    const stillThere = await request(app).get(`/api/applications/${id}`).set(authed(owner.token));
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.application.status).toBe("APPLIED");
  });

  it("changing status logs a timeline event automatically", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;

    await request(app).patch(`/api/applications/${id}`).set(authed(token)).send({ status: "INTERVIEWING" });

    const res = await request(app).get(`/api/applications/${id}`).set(authed(token));
    expect(res.body.application.status).toBe("INTERVIEWING");
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].note).toBe("Status changed: APPLIED → INTERVIEWING");
  });

  it("a no-op patch (same status, or an unrelated field) does not add a timeline event", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;

    await request(app).patch(`/api/applications/${id}`).set(authed(token)).send({ notes: "Recruiter called." });

    const res = await request(app).get(`/api/applications/${id}`).set(authed(token));
    expect(res.body.events).toHaveLength(0);
  });

  it("adds a manual follow-up note as its own timeline event", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;

    const added = await request(app).post(`/api/applications/${id}/events`).set(authed(token)).send({ note: "Sent a follow-up email." });
    expect(added.status).toBe(201);

    const res = await request(app).get(`/api/applications/${id}`).set(authed(token));
    expect(res.body.events.map((e: any) => e.note)).toEqual(["Sent a follow-up email."]);
  });

  it("deletes an application, and it's gone for good — 404 afterward, not just hidden", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;

    const del = await request(app).delete(`/api/applications/${id}`).set(authed(token));
    expect(del.status).toBe(204);

    const res = await request(app).get(`/api/applications/${id}`).set(authed(token));
    expect(res.status).toBe(404);
  });

  it("deleting an application also deletes its events (cascade), not orphaned rows", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });
    const id = created.body.application.id;
    await request(app).post(`/api/applications/${id}/events`).set(authed(token)).send({ note: "A note." });

    await request(app).delete(`/api/applications/${id}`).set(authed(token));

    await expect(prisma.applicationEvent.findMany({ where: { applicationId: id } })).resolves.toEqual([]);
  });
});

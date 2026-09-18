import request from "supertest";
import { prisma } from "../../db";
import { app, authed, registerUser, resetDb } from "./helpers";

// Never hit real Anthropic/Voyage APIs in CI — these routes are tested for
// wiring, persistence, and ownership here; the actual matching/scoring
// logic is unit-tested against real math in src/lib/*.test.ts, and the real
// models are exercised by `npm run eval` (see README), not this suite.
jest.mock("../../ai/embeddings");
jest.mock("../../ai/claude");

import { embed, embedOne } from "../../ai/embeddings";
import { extractSkills, draftCoverLetter } from "../../ai/claude";

const mockEmbed = embed as jest.MockedFunction<typeof embed>;
const mockEmbedOne = embedOne as jest.MockedFunction<typeof embedOne>;
const mockExtractSkills = extractSkills as jest.MockedFunction<typeof extractSkills>;
const mockDraftCoverLetter = draftCoverLetter as jest.MockedFunction<typeof draftCoverLetter>;

// 2D unit vectors — same trick as src/lib/matching.test.ts, keeps expected
// cosine similarities exact and human-checkable instead of opaque fixtures.
const NODE_VEC = [1, 0];
const K8S_VEC = [0, 1];

beforeEach(async () => {
  await resetDb();
  mockEmbedOne.mockImplementation(async (text: string) => (text.includes("Node") ? NODE_VEC : K8S_VEC));
  mockEmbed.mockImplementation(async (texts: string[]) => texts.map((t) => (t.includes("Node") ? NODE_VEC : K8S_VEC)));
});
afterAll(async () => prisma.$disconnect());

async function withBullet(token: string, text = "Built REST APIs with Node.js and Postgres") {
  const res = await request(app).post("/api/resume/bullets").set(authed(token)).send({ text });
  return res.body.bullet.id as string;
}

describe("resume bullets", () => {
  it("adds a bullet (embedding computed server-side, never returned to the client)", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/api/resume/bullets").set(authed(token)).send({ text: "Shipped a React Native app to the App Store." });
    expect(res.status).toBe(201);
    expect(res.body.bullet).toMatchObject({ text: "Shipped a React Native app to the App Store." });
    expect(res.body.bullet.embedding).toBeUndefined();
  });

  it("rejects an empty bullet", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/api/resume/bullets").set(authed(token)).send({ text: "  " });
    expect(res.status).toBe(400);
  });

  it("lists only the signed-in user's own bullets", async () => {
    const a = await registerUser();
    const b = await registerUser();
    await withBullet(a.token, "A's bullet");
    await withBullet(b.token, "B's bullet");

    const res = await request(app).get("/api/resume/bullets").set(authed(a.token));
    expect(res.body.bullets).toHaveLength(1);
    expect(res.body.bullets[0].text).toBe("A's bullet");
  });

  it("404s deleting another user's bullet", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const id = await withBullet(owner.token);

    const res = await request(app).delete(`/api/resume/bullets/${id}`).set(authed(intruder.token));
    expect(res.status).toBe(404);
  });

  it("deletes a bullet for its real owner", async () => {
    const { token } = await registerUser();
    const id = await withBullet(token);

    const res = await request(app).delete(`/api/resume/bullets/${id}`).set(authed(token));
    expect(res.status).toBe(204);
    const list = await request(app).get("/api/resume/bullets").set(authed(token));
    expect(list.body.bullets).toHaveLength(0);
  });
});

describe("POST /applications/:id/match", () => {
  async function withApplication(token: string) {
    const res = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Backend Engineer" });
    return res.body.application.id as string;
  }

  it("requires at least one resume bullet first", async () => {
    const { token } = await registerUser();
    const appId = await withApplication(token);

    const res = await request(app).post(`/api/applications/${appId}/match`).set(authed(token)).send({ jobDescription: "x".repeat(30) });
    expect(res.status).toBe(400);
    expect(mockExtractSkills).not.toHaveBeenCalled();
  });

  it("scores required vs preferred skills against resume bullets and persists the result", async () => {
    mockExtractSkills.mockResolvedValue({ required: ["Node.js"], preferred: ["Kubernetes"] });
    const { token } = await registerUser();
    const appId = await withApplication(token);
    await withBullet(token, "Built REST APIs with Node.js and Postgres"); // matches "Node.js", not "Kubernetes"

    const res = await request(app).post(`/api/applications/${appId}/match`).set(authed(token)).send({ jobDescription: "x".repeat(30) });

    expect(res.status).toBe(200);
    expect(res.body.application.matchedSkills).toEqual(["Node.js"]);
    expect(res.body.application.missingSkills).toEqual(["Kubernetes"]);
    // 1 required matched (weight .75) + 0 of 1 preferred matched (weight .25) = 0.75
    expect(res.body.application.matchScore).toBe(0.75);
    expect(res.body.application.jobDescription).toBe("x".repeat(30));
  });

  it("400s when the job description yields no extractable skills", async () => {
    mockExtractSkills.mockResolvedValue({ required: [], preferred: [] });
    const { token } = await registerUser();
    const appId = await withApplication(token);
    await withBullet(token);

    const res = await request(app).post(`/api/applications/${appId}/match`).set(authed(token)).send({ jobDescription: "x".repeat(30) });
    expect(res.status).toBe(400);
  });

  it("404s matching against another user's application", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    const appId = await withApplication(owner.token);
    await withBullet(intruder.token);

    const res = await request(app).post(`/api/applications/${appId}/match`).set(authed(intruder.token)).send({ jobDescription: "x".repeat(30) });
    expect(res.status).toBe(404);
  });
});

describe("POST /applications/:id/cover-letter", () => {
  it("requires at least one resume bullet first", async () => {
    const { token } = await registerUser();
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });

    const res = await request(app).post(`/api/applications/${created.body.application.id}/cover-letter`).set(authed(token));
    expect(res.status).toBe(400);
    expect(mockDraftCoverLetter).not.toHaveBeenCalled();
  });

  it("saves the draft and drops any cited bullet id that isn't actually one of the caller's real bullets", async () => {
    const { token } = await registerUser();
    const realBulletId = await withBullet(token);
    mockDraftCoverLetter.mockResolvedValue({
      letter: "Dear hiring team, ...",
      citedBulletIds: [realBulletId, "not-a-real-bullet-id"],
    });
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Backend Engineer" });

    const res = await request(app).post(`/api/applications/${created.body.application.id}/cover-letter`).set(authed(token));

    expect(res.status).toBe(200);
    expect(res.body.application.coverLetter).toBe("Dear hiring team, ...");
    expect(res.body.application.coverBulletIds).toEqual([realBulletId]); // the fake id was filtered out
    expect(mockDraftCoverLetter).toHaveBeenCalledWith(
      expect.objectContaining({ company: "Acme", role: "Backend Engineer", searchBullets: expect.any(Function) }),
    );
  });

  it("the searchBullets callback passed to the agent ranks by similarity to the query", async () => {
    const { token } = await registerUser();
    await withBullet(token, "Built REST APIs with Node.js and Postgres"); // NODE_VEC
    await withBullet(token, "Ran a Kubernetes cluster in production"); // K8S_VEC
    mockDraftCoverLetter.mockImplementation(async ({ searchBullets }) => {
      const hits = await searchBullets("Node.js");
      return { letter: hits[0]?.text ?? "no hits", citedBulletIds: hits.length ? [hits[0].id] : [] };
    });
    const created = await request(app).post("/api/applications").set(authed(token)).send({ company: "Acme", role: "Dev" });

    const res = await request(app).post(`/api/applications/${created.body.application.id}/cover-letter`).set(authed(token));
    expect(res.body.application.coverLetter).toBe("Built REST APIs with Node.js and Postgres");
  });

  it("404s drafting for another user's application", async () => {
    const owner = await registerUser();
    const intruder = await registerUser();
    await withBullet(intruder.token);
    const created = await request(app).post("/api/applications").set(authed(owner.token)).send({ company: "Acme", role: "Dev" });

    const res = await request(app).post(`/api/applications/${created.body.application.id}/cover-letter`).set(authed(intruder.token));
    expect(res.status).toBe(404);
  });
});

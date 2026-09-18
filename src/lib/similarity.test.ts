import { cosineSimilarity, rankBySimilarity } from "./similarity";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("ignores magnitude, only direction matters", () => {
    expect(cosineSimilarity([1, 1], [50, 50])).toBeCloseTo(1);
  });

  it("is 0 when either vector is all zeros, not NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on a length mismatch instead of silently truncating", () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(/length mismatch/);
  });
});

describe("rankBySimilarity", () => {
  it("sorts closest-first and attaches each item's score", () => {
    const bullets = [
      { id: "far", embedding: [0, 1] },
      { id: "close", embedding: [1, 0.01] },
      { id: "mid", embedding: [1, 1] },
    ];
    const ranked = rankBySimilarity([1, 0], bullets);
    expect(ranked.map((b) => b.id)).toEqual(["close", "mid", "far"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  });

  it("is empty for an empty list", () => {
    expect(rankBySimilarity([1, 0], [])).toEqual([]);
  });
});

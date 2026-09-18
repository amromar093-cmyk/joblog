import { computeMatchScore, matchSkillsAgainstBullets, type SkillCheck } from "./matching";

// 2D unit vectors at a chosen angle make the cosine similarity land exactly
// where the test needs it: cos(0deg)=1, cos(60deg)=0.5, cos(90deg)=0.
const vecAtDeg = (deg: number): number[] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

describe("matchSkillsAgainstBullets", () => {
  const bullets = [{ embedding: vecAtDeg(0) }, { embedding: vecAtDeg(90) }];

  it("matches a skill whose best bullet is at or above the threshold", () => {
    const [result] = matchSkillsAgainstBullets([{ text: "React", embedding: vecAtDeg(10) }], bullets);
    expect(result.matched).toBe(true);
    expect(result.bestScore).toBeGreaterThan(0.9);
  });

  it("does not match a skill with no close bullet", () => {
    const [result] = matchSkillsAgainstBullets([{ text: "Rust", embedding: vecAtDeg(180) }], bullets);
    expect(result.matched).toBe(false);
  });

  it("takes the best score across all bullets, not the first", () => {
    const [result] = matchSkillsAgainstBullets([{ text: "SQL", embedding: vecAtDeg(89) }], bullets);
    expect(result.matched).toBe(true); // close to the 90deg bullet even though the 0deg one is a poor match
  });

  it("returns one result per skill, unmatched when there are no bullets at all", () => {
    const results = matchSkillsAgainstBullets([{ text: "Go", embedding: vecAtDeg(0) }], []);
    expect(results).toEqual([{ text: "Go", matched: false, bestScore: -1 }]);
  });
});

describe("computeMatchScore", () => {
  const matched = (n: number): SkillCheck[] => Array.from({ length: n }, (_, i) => ({ text: `s${i}`, matched: true, bestScore: 1 }));
  const unmatched = (n: number): SkillCheck[] => Array.from({ length: n }, (_, i) => ({ text: `s${i}`, matched: false, bestScore: 0 }));

  it("is 1 when everything matches", () => {
    expect(computeMatchScore(matched(3), matched(2))).toBe(1);
  });

  it("is 0 when nothing matches", () => {
    expect(computeMatchScore(unmatched(3), unmatched(2))).toBe(0);
  });

  it("weights required 3x preferred", () => {
    // all required matched, none preferred -> 0.75; the reverse -> 0.25
    expect(computeMatchScore(matched(2), unmatched(2))).toBe(0.75);
    expect(computeMatchScore(unmatched(2), matched(2))).toBe(0.25);
  });

  it("treats an empty side as fully satisfied instead of penalizing the score", () => {
    // no preferred skills listed at all -> preferred side shouldn't drag the score down
    expect(computeMatchScore(matched(2), [])).toBe(1);
  });
});

import { cosineSimilarity } from "./similarity";

export type SkillCheck = { text: string; matched: boolean; bestScore: number };

/** A skill counts as "matched" once some resume bullet is a close enough
 *  semantic match — 0.5 cosine similarity is a deliberately generous bar
 *  (embeddings rarely exceed ~0.8 even for near-duplicate phrasing), chosen
 *  so paraphrasing ("built REST APIs" vs "designed HTTP APIs") still counts. */
const MATCH_THRESHOLD = 0.5;

export function matchSkillsAgainstBullets(
  skills: { text: string; embedding: number[] }[],
  bullets: { embedding: number[] }[],
  threshold = MATCH_THRESHOLD,
): SkillCheck[] {
  return skills.map((skill) => {
    const bestScore = bullets.reduce((best, b) => Math.max(best, cosineSimilarity(skill.embedding, b.embedding)), -1);
    return { text: skill.text, matched: bestScore >= threshold, bestScore };
  });
}

/** Weights required skills 3x preferred ones — matching every "must-have" but
 *  none of the "nice-to-have"s should still score well above matching only
 *  the preferred ones. A side with zero skills counts as fully satisfied
 *  rather than dragging the score down for a posting that just didn't list
 *  any preferred skills. */
export function computeMatchScore(required: SkillCheck[], preferred: SkillCheck[]): number {
  const REQUIRED_WEIGHT = 0.75;
  const PREFERRED_WEIGHT = 0.25;
  const requiredScore = required.length ? required.filter((s) => s.matched).length / required.length : 1;
  const preferredScore = preferred.length ? preferred.filter((s) => s.matched).length / preferred.length : 1;
  return Math.round((REQUIRED_WEIGHT * requiredScore + PREFERRED_WEIGHT * preferredScore) * 100) / 100;
}

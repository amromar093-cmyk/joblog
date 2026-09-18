/** Cosine similarity between two equal-length embedding vectors, in [-1, 1]
 *  (in practice close to [0, 1] for embedding models, since most embedding
 *  spaces don't use the negative half). Throws on a length mismatch rather
 *  than silently truncating — that only happens if two different embedding
 *  models got mixed, which is a bug worth surfacing loudly. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Ranks `bullets` against `target` by cosine similarity, best first. */
export function rankBySimilarity<T extends { embedding: number[] }>(target: number[], bullets: T[]): (T & { score: number })[] {
  return bullets
    .map((b) => ({ ...b, score: cosineSimilarity(target, b.embedding) }))
    .sort((x, y) => y.score - x.score);
}

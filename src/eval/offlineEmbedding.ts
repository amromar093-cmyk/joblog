/** A deterministic, zero-cost stand-in for a real embedding model — bag-of-
 *  words vectors over a shared vocabulary, L2-normalized so cosine
 *  similarity behaves the same way it would for real embeddings (closer to
 *  1 the more vocabulary two texts share). This is nowhere near as good at
 *  catching paraphrases as Voyage's actual model (see src/ai/embeddings.ts)
 *  — it exists only so `npm run demo` can show the real matching pipeline
 *  end-to-end without an API key or a network call. */

const STOPWORDS = new Set(["a", "an", "the", "and", "or", "with", "for", "of", "in", "on", "to", "is", "are", "at", "as"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.+#\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

/** Embeds every text against ONE shared vocabulary built from all of them
 *  together — unlike a real embedding model, these vectors are only
 *  meaningful relative to each other within a single call. */
export function offlineEmbedBatch(texts: string[]): number[][] {
  const vocab = new Map<string, number>();
  const tokenized = texts.map(tokenize);
  for (const tokens of tokenized) {
    for (const t of tokens) if (!vocab.has(t)) vocab.set(t, vocab.size);
  }

  return tokenized.map((tokens) => {
    const vec = new Array(vocab.size).fill(0);
    for (const t of tokens) vec[vocab.get(t)!] += 1;
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag === 0 ? vec : vec.map((v) => v / mag);
  });
}

/** A tiny keyword list standing in for Claude's structured skill extraction
 *  — real skills that would plausibly appear in a backend/mobile job post.
 *  Real extraction (src/ai/claude.ts `extractSkills`) reads arbitrary
 *  postings; this only recognizes what's in the list below. Kept free of
 *  near-duplicates ("sql" would substring-match inside "postgresql") on
 *  purpose — word-boundary matching alone doesn't fix a short skill name
 *  that's legitimately a substring of a longer one. */
const KNOWN_SKILLS = [
  "node.js", "typescript", "javascript", "postgresql", "prisma",
  "express", "rest api", "graphql", "docker", "kubernetes", "aws", "ci/cd", "jest",
  "react", "react native", "expo", "swift", "kotlin", "python", "django",
  "redis", "kafka", "microservices", "authentication", "jwt",
];

function containsSkill(lower: string, skill: string): boolean {
  // \b doesn't work around "." or "+" (node.js, ci/cd) the way it does for
  // plain words, so escape the skill and only require non-word boundaries
  // on whichever sides are actually word characters.
  const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const left = /^\w/.test(skill) ? "\\b" : "";
  const right = /\w$/.test(skill) ? "\\b" : "";
  return new RegExp(`${left}${esc}${right}`).test(lower);
}

export function extractSkillsOffline(jobDescription: string): { required: string[]; preferred: string[] } {
  const lower = jobDescription.toLowerCase();
  const present = KNOWN_SKILLS.filter((s) => containsSkill(lower, s));

  // Naive but reasonable heuristic: whichever skills are mentioned before
  // the first "nice to have / preferred / bonus" marker count as required;
  // no marker at all means everything is required.
  const preferredMarkers = ["nice to have", "nice-to-have", "preferred", "bonus"];
  const prefIdx = preferredMarkers.reduce((min, m) => {
    const idx = lower.indexOf(m);
    return idx >= 0 && idx < min ? idx : min;
  }, Infinity);

  return {
    required: present.filter((s) => lower.indexOf(s) < prefIdx),
    preferred: present.filter((s) => lower.indexOf(s) >= prefIdx),
  };
}

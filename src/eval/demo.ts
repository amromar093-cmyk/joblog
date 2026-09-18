/** Zero-cost, zero-API-key walkthrough of the real matching pipeline.
 *
 * This runs the ACTUAL production logic from src/lib/matching.ts and
 * src/lib/similarity.ts — only the embedding model and skill extraction are
 * swapped for free, offline stand-ins (see offlineEmbedding.ts). The real
 * app uses Claude + Voyage for those two steps instead; this script exists
 * so the matching pipeline itself can be seen working without spending
 * anything. `npm run eval` is the version that hits the real models.
 *
 * Run: npm run demo
 */
import { offlineEmbedBatch, extractSkillsOffline } from "./offlineEmbedding";
import { computeMatchScore, matchSkillsAgainstBullets } from "../lib/matching";
import { rankBySimilarity } from "../lib/similarity";

const resumeBullets = [
  "Built and shipped REST APIs in Node.js and Express, backed by PostgreSQL via Prisma.",
  "Wrote unit and integration tests with Jest, including a CI pipeline on GitHub Actions.",
  "Implemented JWT-based authentication and ownership-scoped authorization for a multi-tenant API.",
  "Built a React Native app with Expo and shipped it to the App Store.",
];

const jobDescription = `We're hiring a Backend Engineer to build our core API.
Requirements: strong Node.js and TypeScript experience, PostgreSQL, experience writing automated tests with Jest.
Nice to have: Kubernetes, Docker, GraphQL.`;

function bar(label: string, score: number, width = 30) {
  const filled = Math.round(score * width);
  return `${label.padEnd(10)} [${"#".repeat(filled)}${"-".repeat(width - filled)}] ${(score * 100).toFixed(0)}%`;
}

function main() {
  console.log("=== JobLog match demo (offline — no API key, no cost) ===\n");

  console.log("Resume bullets:");
  resumeBullets.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));

  console.log("\nJob description:");
  console.log(
    jobDescription
      .split("\n")
      .map((l) => "  " + l)
      .join("\n"),
  );

  // --- Step 1: extract skills (offline stand-in for Claude's structured output) ---
  const { required, preferred } = extractSkillsOffline(jobDescription);
  console.log(`\nExtracted skills — required: [${required.join(", ")}]  preferred: [${preferred.join(", ")}]`);

  // --- Step 2: embed everything in one shared vocabulary (offline stand-in for Voyage) ---
  const skillTexts = [...required, ...preferred];
  const allTexts = [...resumeBullets, ...skillTexts];
  const allVectors = offlineEmbedBatch(allTexts);
  const bullets = resumeBullets.map((text, i) => ({ text, embedding: allVectors[i] }));
  const skills = skillTexts.map((text, i) => ({ text, embedding: allVectors[resumeBullets.length + i] }));
  const requiredSkills = skills.slice(0, required.length);
  const preferredSkills = skills.slice(required.length);

  // --- Step 3: the REAL matching logic (src/lib/matching.ts, unmodified) ---
  // Lower threshold than production (0.5): bag-of-words cosine similarity
  // between a 1-2 word skill and a full sentence tops out much lower than
  // it would for real dense embeddings, even on a clean exact-word match —
  // a real short vector pointing at one dimension is never going to be
  // "close" in direction to a long vector spread over ten. Voyage's actual
  // embeddings don't have this artifact, which is exactly why they're the
  // real model and this is only a free stand-in for the demo.
  const OFFLINE_THRESHOLD = 0.25;
  const requiredResults = matchSkillsAgainstBullets(requiredSkills, bullets, OFFLINE_THRESHOLD);
  const preferredResults = matchSkillsAgainstBullets(preferredSkills, bullets, OFFLINE_THRESHOLD);
  const score = computeMatchScore(requiredResults, preferredResults);

  console.log("\n--- Fit score (real production logic, src/lib/matching.ts) ---");
  console.log(bar("Fit", score));
  for (const r of [...requiredResults, ...preferredResults]) {
    console.log(`  ${r.matched ? "✓ matched" : "✗ missing"}  ${r.text.padEnd(14)} (best similarity: ${r.bestScore.toFixed(2)})`);
  }

  // --- Step 4: simulate what the cover-letter agent would search for ---
  console.log("\n--- Cover-letter agent's retrieval (real ranking logic, src/lib/similarity.ts) ---");
  console.log("(the real agent picks these queries itself, one per skill it wants evidence for)\n");
  const cited = new Map<string, string>();
  for (const skill of requiredResults.filter((s) => s.matched)) {
    const qVec = allVectors[resumeBullets.length + skillTexts.indexOf(skill.text)];
    const [top] = rankBySimilarity(qVec, bullets);
    console.log(`  search_resume_bullets("${skill.text}") -> best match: "${top.text}" (${top.score.toFixed(2)})`);
    cited.set(skill.text, top.text);
  }

  console.log("\n--- Offline stand-in letter (real drafting is Claude's job — see npm run eval) ---");
  const citedBullets = [...new Set(cited.values())];
  console.log(
    `  Dear Hiring Team,\n\n` +
      `  I'm excited to apply for the Backend Engineer role. ${citedBullets.join(" ")}\n\n` +
      `  I'd welcome the chance to bring this experience to your team.\n\n` +
      `  Sincerely,\n  [Name]`,
  );
  console.log(`\n  Cited ${citedBullets.length} real resume bullet(s) — every sentence above traces back to one listed above.`);
}

main();

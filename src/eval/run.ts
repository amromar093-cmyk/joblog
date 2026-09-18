/** Real-API evaluation harness — hits Anthropic + Voyage for real, unlike
 *  the mocked route tests. Deliberately NOT part of `npm test` or CI: it
 *  costs money and needs API keys, neither of which belongs in a PR check.
 *  Run manually with `npm run eval` whenever the extraction prompt, the
 *  matching threshold, or the cover-letter system prompt changes. */
import { env } from "../env";
import { matchFixtures, coverLetterFixtures } from "./fixtures";
import { extractSkills, draftCoverLetter } from "../ai/claude";
import { embed, embedOne } from "../ai/embeddings";
import { matchSkillsAgainstBullets } from "../lib/matching";
import { rankBySimilarity } from "../lib/similarity";
import { judgeFaithfulness } from "./judge";

// Extracted skill phrasing ("Node.js & TypeScript") won't exactly match a
// fixture's expected phrasing ("Node.js") — a loose substring check in
// either direction is the right amount of fuzz for a human-curated fixture,
// without being so loose it stops catching real regressions.
function fuzzyFind(expected: string[], pool: string[]): string[] {
  const poolLower = pool.map((p) => p.toLowerCase());
  return expected.filter((e) => poolLower.some((p) => p.includes(e.toLowerCase()) || e.toLowerCase().includes(p)));
}

async function runMatchEval(): Promise<boolean> {
  console.log("\n=== Skill-match eval ===");
  let pass = 0;
  for (const fx of matchFixtures) {
    const bulletEmbeddings = await embed(fx.resumeBullets);
    const bullets = fx.resumeBullets.map((text, i) => ({ text, embedding: bulletEmbeddings[i] }));

    const { required, preferred } = await extractSkills(fx.jobDescription);
    const skillTexts = [...required, ...preferred];
    const skillEmbeddings = skillTexts.length ? await embed(skillTexts) : [];
    const skills = skillTexts.map((text, i) => ({ text, embedding: skillEmbeddings[i] }));
    const results = matchSkillsAgainstBullets(skills, bullets);

    const matchedTexts = results.filter((r) => r.matched).map((r) => r.text);
    const missingTexts = results.filter((r) => !r.matched).map((r) => r.text);

    const matchedHits = fuzzyFind(fx.expectMatched, matchedTexts);
    const missingHits = fuzzyFind(fx.expectMissing, missingTexts);
    const ok = matchedHits.length === fx.expectMatched.length && missingHits.length === fx.expectMissing.length;
    pass += ok ? 1 : 0;

    console.log(`${ok ? "PASS" : "FAIL"} — ${fx.name}`);
    console.log(`  extracted: required=[${required.join(", ")}] preferred=[${preferred.join(", ")}]`);
    if (!ok) {
      console.log(`  expected matched: [${fx.expectMatched.join(", ")}] — found ${matchedHits.length}/${fx.expectMatched.length}`);
      console.log(`  expected missing: [${fx.expectMissing.join(", ")}] — found ${missingHits.length}/${fx.expectMissing.length}`);
      console.log(`  actual matched: [${matchedTexts.join(", ")}]`);
      console.log(`  actual missing: [${missingTexts.join(", ")}]`);
    }
  }
  console.log(`Match eval: ${pass}/${matchFixtures.length} fixtures passed`);
  return pass === matchFixtures.length;
}

async function runCoverLetterEval(): Promise<boolean> {
  console.log("\n=== Cover-letter faithfulness eval ===");
  let pass = 0;
  for (const fx of coverLetterFixtures) {
    const embeddings = await embed(fx.resumeBullets);
    const bullets = fx.resumeBullets.map((text, i) => ({ id: `b${i}`, text, embedding: embeddings[i] }));

    const { letter, citedBulletIds } = await draftCoverLetter({
      company: fx.company,
      role: fx.role,
      jobDescription: fx.jobDescription,
      searchBullets: async (query) => {
        const qEmb = await embedOne(query);
        return rankBySimilarity(qEmb, bullets)
          .slice(0, 5)
          .map((b) => ({ id: b.id, text: b.text }));
      },
    });

    const citedTexts = bullets.filter((b) => citedBulletIds.includes(b.id)).map((b) => b.text);
    const judged = await judgeFaithfulness(letter, citedTexts);
    pass += judged.faithful ? 1 : 0;

    console.log(`${judged.faithful ? "PASS" : "FAIL"} — ${fx.name} (cited ${citedBulletIds.length}/${bullets.length} bullets)`);
    if (!judged.faithful) console.log(`  issues: ${judged.issues.join("; ")}`);
    console.log(
      letter
        .split("\n")
        .map((l) => "    " + l)
        .join("\n"),
    );
  }
  console.log(`Cover-letter eval: ${pass}/${coverLetterFixtures.length} fixtures passed`);
  return pass === coverLetterFixtures.length;
}

async function main() {
  if (!env.ANTHROPIC_API_KEY || !env.VOYAGE_API_KEY) {
    console.log("Set ANTHROPIC_API_KEY and VOYAGE_API_KEY in .env to run the eval (see README) — skipping, not failing.");
    process.exit(0);
  }
  const matchOk = await runMatchEval();
  const letterOk = await runCoverLetterEval();
  const ok = matchOk && letterOk;
  console.log(`\n${ok ? "All eval fixtures passed." : "Some eval fixtures failed — see above."}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

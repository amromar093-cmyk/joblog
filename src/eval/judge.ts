import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

const MODEL = "claude-sonnet-5";

const JUDGE_TOOL: Anthropic.Tool = {
  name: "record_judgment",
  description: "Records whether a cover letter's claims are all supported by the cited resume bullets.",
  input_schema: {
    type: "object",
    properties: {
      faithful: { type: "boolean", description: "True only if EVERY factual claim in the letter is directly supported by the cited bullets." },
      issues: { type: "array", items: { type: "string" }, description: "Specific unsupported or embellished claims found, if any." },
    },
    required: ["faithful", "issues"],
  },
};

/** LLM-as-judge: a second, independent Claude call grades whether a drafted
 *  cover letter stayed inside the evidence it cited. Structural validation
 *  (does citedBulletIds only contain real ids?) happens in the route handler
 *  — this catches the harder case: the id is real, but the letter's PROSE
 *  claims more than that bullet actually supports. */
export async function judgeFaithfulness(letter: string, citedBullets: string[]): Promise<{ faithful: boolean; issues: string[] }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required to run the eval.");
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [JUDGE_TOOL],
    tool_choice: { type: "tool", name: "record_judgment" },
    messages: [
      {
        role: "user",
        content: `You are grading a cover letter for factual faithfulness. The candidate's ONLY real evidence is the resume bullets listed below. Read the letter and flag ANY claim that isn't directly backed by one of these bullets — no matter how plausible-sounding.\n\nResume bullets:\n${citedBullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\nCover letter:\n${letter}`,
      },
    ],
  });

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) return { faithful: false, issues: ["Judge did not return a structured result."] };
  const input = toolUse.input as { faithful?: unknown; issues?: unknown };
  return {
    faithful: input.faithful === true,
    issues: Array.isArray(input.issues) ? input.issues.filter((x): x is string => typeof x === "string") : [],
  };
}

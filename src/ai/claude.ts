import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { serviceUnavailable } from "../errors";

const MODEL = "claude-sonnet-5";
const MAX_AGENT_TURNS = 6;

function client() {
  if (!env.ANTHROPIC_API_KEY) {
    throw serviceUnavailable("The AI drafting service isn't configured on this server (missing ANTHROPIC_API_KEY).");
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function isToolUse(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// --- Skill extraction -------------------------------------------------
// Structured output via a forced tool call, not "please reply in JSON" —
// the model literally cannot return anything that doesn't match the schema.

const RECORD_SKILLS_TOOL: Anthropic.Tool = {
  name: "record_skills",
  description: "Records the skills and requirements found in a job posting.",
  input_schema: {
    type: "object",
    properties: {
      required: { type: "array", items: { type: "string" }, description: "Must-have skills/requirements, each a short 2-4 word phrase." },
      preferred: { type: "array", items: { type: "string" }, description: "Nice-to-have skills, each a short 2-4 word phrase." },
    },
    required: ["required", "preferred"],
  },
};

export type ExtractedSkills = { required: string[]; preferred: string[] };

export async function extractSkills(jobDescription: string): Promise<ExtractedSkills> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [RECORD_SKILLS_TOOL],
    tool_choice: { type: "tool", name: "record_skills" },
    messages: [
      {
        role: "user",
        content: `Extract the skills and requirements from this job posting as short phrases (2-4 words each), split into must-haves and nice-to-haves. Skip generic filler ("team player", "fast-paced environment") — only concrete skills, tools, and qualifications.\n\n${jobDescription}`,
      },
    ],
  });

  const toolUse = msg.content.find(isToolUse);
  if (!toolUse) throw serviceUnavailable("The AI didn't return a structured result. Try again.");
  const input = toolUse.input as { required?: unknown; preferred?: unknown };
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
  return { required: strings(input.required), preferred: strings(input.preferred) };
}

// --- Cover-letter agent -------------------------------------------------
// A real tool-use loop: the model decides what to search for and can call
// search_resume_bullets as many times as it wants before submitting. The
// server never pre-stuffs the prompt with the whole resume — retrieval is
// the model's choice, which is also what keeps the citation trail honest:
// every claim in the letter has to trace back to a bullet it actually asked
// for and got back as a tool_result, not one we assumed was relevant.

export type BulletHit = { id: string; text: string };

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_resume_bullets",
  description:
    "Searches the candidate's resume for the bullets most relevant to a query (a skill, technology, or responsibility). Call it once per distinct thing worth backing up before writing — e.g. separately for 'led a team' and 'PostgreSQL'.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "What to search for, e.g. 'led a team' or 'PostgreSQL'." } },
    required: ["query"],
  },
};

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_cover_letter",
  description: "Submits the final cover letter draft, citing the resume bullet ids that support every claim made in it.",
  input_schema: {
    type: "object",
    properties: {
      letter: { type: "string", description: "The full cover letter text." },
      citedBulletIds: { type: "array", items: { type: "string" }, description: "Ids of every resume bullet actually referenced in the letter." },
    },
    required: ["letter", "citedBulletIds"],
  },
};

const SYSTEM_PROMPT = `You write concise, specific cover letters for software engineering job applications (250-350 words).

Rules:
- You MUST NOT claim any experience, skill, or accomplishment that isn't backed by a resume bullet you retrieved with search_resume_bullets. If you can't find support for something the role wants, simply don't claim it — never invent or embellish.
- Search for evidence on each distinct thing the role needs (do several searches with different queries) before writing.
- Every factual claim in the letter must trace to a bullet id you cite in citedBulletIds.
- No generic filler ("I am a hard worker", "I am passionate about..."). Be specific and concrete.
- Call submit_cover_letter exactly once, when the draft is ready.`;

export type CoverLetterResult = { letter: string; citedBulletIds: string[] };

export async function draftCoverLetter(params: {
  company: string;
  role: string;
  jobDescription?: string | null;
  searchBullets: (query: string) => Promise<BulletHit[]>;
}): Promise<CoverLetterResult> {
  const anthropic = client();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Company: ${params.company}\nRole: ${params.role}\n${params.jobDescription ? `Job description:\n${params.jobDescription}\n` : ""}\nDraft the cover letter — search for supporting evidence first, then submit.`,
    },
  ];

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [SEARCH_TOOL, SUBMIT_TOOL],
      messages,
    });
    messages.push({ role: "assistant", content: msg.content });

    const toolUses = msg.content.filter(isToolUse);
    const submit = toolUses.find((t) => t.name === "submit_cover_letter");
    if (submit) {
      const input = submit.input as { letter?: unknown; citedBulletIds?: unknown };
      const letter = typeof input.letter === "string" ? input.letter.trim() : "";
      const citedBulletIds = Array.isArray(input.citedBulletIds) ? input.citedBulletIds.filter((x): x is string => typeof x === "string") : [];
      if (!letter) throw serviceUnavailable("The AI didn't produce a letter. Try again.");
      return { letter, citedBulletIds };
    }

    if (toolUses.length === 0) {
      messages.push({ role: "user", content: "Call submit_cover_letter with your draft now." });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      if (use.name !== "search_resume_bullets") continue;
      const query = typeof (use.input as { query?: unknown }).query === "string" ? (use.input as { query: string }).query : "";
      const hits = query ? await params.searchBullets(query) : [];
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: hits.length ? hits.map((h) => `[${h.id}] ${h.text}`).join("\n") : "No matching resume bullets found.",
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw serviceUnavailable("The AI didn't finish drafting in time. Try again.");
}

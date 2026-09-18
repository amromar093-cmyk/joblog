import { env } from "../env";
import { serviceUnavailable } from "../errors";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

type VoyageResponse = { data: { embedding: number[]; index: number }[] };

/** Embeds one or more strings with Voyage (Anthropic's recommended
 *  embeddings partner — Claude itself has no embeddings endpoint). Returns
 *  vectors in the same order as `texts`. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) {
    throw serviceUnavailable("Embeddings aren't configured on this server (missing VOYAGE_API_KEY).");
  }
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: "document" }),
  });

  if (!res.ok) {
    throw serviceUnavailable(`Embeddings request failed (${res.status}). Try again shortly.`);
  }
  const json = (await res.json()) as VoyageResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  return vec;
}

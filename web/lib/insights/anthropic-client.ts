// Thin server-only wrapper around @anthropic-ai/sdk for per-session
// insight generation. The SDK key MUST never leak to the browser —
// this module imports the SDK at module scope so any client-side
// import will fail loudly during build.

import Anthropic from "@anthropic-ai/sdk";

import { MAX_OUTPUT_TOKENS, MODEL } from "./prompt";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export type GenerateInsightResult = {
  markdown: string;
  input_tokens: number;
  output_tokens: number;
};

export async function generateInsight(prompt: string): Promise<GenerateInsightResult> {
  const client = getClient();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const markdown = res.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!markdown) {
    throw new Error("Anthropic response contained no text content");
  }

  return {
    markdown,
    input_tokens: res.usage.input_tokens ?? 0,
    output_tokens: res.usage.output_tokens ?? 0,
  };
}

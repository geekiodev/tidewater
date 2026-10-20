import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicEnv } from "@/lib/env";
import { BRIEF_LIMITS, BRIEF_SYSTEM_PROMPT, buildBriefUserMessage, type BriefPayload } from "./brief";

/**
 * Server-only model call. The API key is read from the server environment
 * and never leaves this module; nothing here is imported by client code
 * ("server-only" makes that a build error).
 */
export async function generateBrief(payload: BriefPayload) {
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = anthropicEnv();
  const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    timeout: BRIEF_LIMITS.timeoutMs,
    maxRetries: 1,
  });

  const message = await client.messages.create(
    {
      model: ANTHROPIC_MODEL,
      max_tokens: BRIEF_LIMITS.maxOutputTokens,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildBriefUserMessage(payload) }],
      // No tools are offered, so the model can only return text.
    },
    { timeout: BRIEF_LIMITS.timeoutMs },
  );

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    truncated: message.stop_reason === "max_tokens",
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  };
}

export { Anthropic };

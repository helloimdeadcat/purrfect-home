/**
 * Minimal OpenAI-compatible chat client (no SDK): one POST to
 * `${baseUrl}chat/completions` with optional tools. Server only — the API
 * key never reaches the browser.
 */
import type { AiConfig } from "@/lib/ai/config";

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limited" | "auth" | "upstream" | "timeout",
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 45_000;

export async function chatCompletion(
  config: AiConfig,
  input: { messages: ChatMessage[]; tools?: ChatTool[]; temperature?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ content: string | null; toolCalls: ChatToolCall[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.4,
        ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new AiError("The assistant took too long to answer", "timeout");
    throw new AiError("Could not reach the AI provider", "upstream");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new AiError("The free AI quota is used up for now — try again later", "rate_limited");
  if (response.status === 401 || response.status === 403) throw new AiError("The AI key is missing or invalid", "auth");
  if (!response.ok) throw new AiError(`AI provider error (${response.status})`, "upstream");

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ChatToolCall[] } }[];
  };
  const message = data.choices?.[0]?.message;
  return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
}

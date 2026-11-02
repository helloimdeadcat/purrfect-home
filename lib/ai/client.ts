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

/** Multimodal user content (OpenAI format); images go in as data: URLs. */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "user"; content: ChatContentPart[] }
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
/** Shorter wait for the main model when a fallback can still answer in time. */
const TIMEOUT_BEFORE_FALLBACK_MS = 25_000;
/** A fallback attempt needs at least this much time left to be worth it. */
const MIN_FALLBACK_MS = 8_000;
/** After the main model fails, skip it for a while (per server instance). */
const MAIN_MODEL_COOLDOWN_MS = 5 * 60_000;

const modelDownUntil = new Map<string, number>();

type ChatInput = {
  messages: ChatMessage[];
  tools?: ChatTool[];
  temperature?: number;
  /** "json_object" asks the model for one JSON object instead of prose. */
  responseFormat?: "json_object";
  /** Epoch ms by which the call must finish; timeouts are cut to fit. */
  deadline?: number;
};
type ChatResult = { content: string | null; toolCalls: ChatToolCall[]; model: string };

/**
 * One chat completion. If the main model is overloaded, slow or out of free
 * quota, the same request goes to `config.fallbackModel`, and the main model
 * is skipped for a few minutes so the next requests don't wait for it again.
 * `model` in the result says which one answered.
 */
export async function chatCompletion(
  config: AiConfig,
  input: ChatInput,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ChatResult> {
  const timeLeft = () => (input.deadline === undefined ? Infinity : input.deadline - now());
  const fallback = config.fallbackModel;
  if (!fallback) return requestOnce(config, config.model, input, fetchImpl, Math.min(TIMEOUT_MS, timeLeft()));
  if ((modelDownUntil.get(config.model) ?? 0) > now()) {
    return requestOnce(config, fallback, input, fetchImpl, Math.min(TIMEOUT_MS, timeLeft()));
  }
  try {
    return await requestOnce(config, config.model, input, fetchImpl, Math.min(TIMEOUT_BEFORE_FALLBACK_MS, timeLeft() - MIN_FALLBACK_MS));
  } catch (error) {
    if (!(error instanceof AiError) || error.kind === "auth") throw error;
    modelDownUntil.set(config.model, now() + MAIN_MODEL_COOLDOWN_MS);
    return requestOnce(config, fallback, input, fetchImpl, Math.min(TIMEOUT_MS, timeLeft()));
  }
}

/** Test helper: forget which models were marked as down. */
export function resetModelHealth() {
  modelDownUntil.clear();
}

async function requestOnce(
  config: AiConfig,
  model: string,
  input: ChatInput,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ChatResult> {
  if (timeoutMs <= 0) throw new AiError("Морти слишком долго думал — попробуй ещё раз", "timeout");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.4,
        ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}),
        ...(input.responseFormat ? { response_format: { type: input.responseFormat } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new AiError("Морти слишком долго думал — попробуй ещё раз", "timeout");
    throw new AiError("Не получилось связаться с ИИ-сервисом", "upstream");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new AiError("Бесплатный лимит ИИ пока исчерпан — попробуй позже", "rate_limited");
  if (response.status === 401 || response.status === 403) throw new AiError("Ключ ИИ не указан или неверный", "auth");
  if (!response.ok) throw new AiError(`Ошибка ИИ-сервиса (${response.status})`, "upstream");

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ChatToolCall[] } }[];
  };
  const message = data.choices?.[0]?.message;
  return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [], model };
}

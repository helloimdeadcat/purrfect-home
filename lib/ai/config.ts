/**
 * AI provider settings (server only). Any OpenAI-compatible chat endpoint
 * works; the defaults target Google Gemini's free tier.
 *
 *   AI_API_KEY   — required (Gemini key from aistudio.google.com)
 *   AI_BASE_URL  — default: Gemini's OpenAI-compatible endpoint
 *   AI_MODEL     — default: gemini-3.8-flash (Google's current free Flash);
 *                  override if Google renames models again
 *   AI_FALLBACK_MODEL — used when the main model is overloaded, times out or
 *                  is out of free quota; default: gemini-3.5-flash-lite,
 *                  "off" disables it
 */
export type AiConfig = { apiKey: string; baseUrl: string; model: string; fallbackModel?: string };

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const base = env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = env.AI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  return {
    apiKey,
    baseUrl: base.endsWith("/") ? base : `${base}/`,
    model,
    ...(fallback !== "off" && fallback !== model ? { fallbackModel: fallback } : {}),
  };
}

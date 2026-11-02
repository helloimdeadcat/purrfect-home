/**
 * AI provider settings (server only). Any OpenAI-compatible chat endpoint
 * works; the defaults target Google Gemini's free tier.
 *
 *   AI_API_KEY   — required (Gemini key from aistudio.google.com)
 *   AI_BASE_URL  — default: Gemini's OpenAI-compatible endpoint
 *   AI_MODEL     — default: gemini-flash-latest (always the newest Flash,
 *                  which stays on the free tier); override if Google
 *                  renames models
 *   AI_FALLBACK_MODEL — used when the main model is overloaded, times out or
 *                  is out of free quota; default: gemini-flash-lite-latest,
 *                  "off" disables it
 */
export type AiConfig = { apiKey: string; baseUrl: string; model: string; fallbackModel?: string };

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const DEFAULT_MODEL = "gemini-flash-latest";
export const DEFAULT_FALLBACK_MODEL = "gemini-flash-lite-latest";

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

/**
 * AI provider settings (server only). Any OpenAI-compatible chat endpoint
 * works; the defaults target Google Gemini's free tier.
 *
 *   AI_API_KEY   — required (Gemini key from aistudio.google.com)
 *   AI_BASE_URL  — default: Gemini's OpenAI-compatible endpoint
 *   AI_MODEL     — default: gemini-flash-latest (always the newest Flash,
 *                  which stays on the free tier); override if Google
 *                  renames models
 */
export type AiConfig = { apiKey: string; baseUrl: string; model: string };

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const DEFAULT_MODEL = "gemini-flash-latest";

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const base = env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return {
    apiKey,
    baseUrl: base.endsWith("/") ? base : `${base}/`,
    model: env.AI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

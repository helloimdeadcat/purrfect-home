/**
 * Per-user limits that protect the free AI quota. The count lives in the
 * database (take_ai_quota), so every Vercel instance sees the same numbers.
 * Until that migration is applied, an in-memory limiter is the fallback.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit; returns false (without recording) when over the limit. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export type AiUsageKind = "assistant" | "receipt_scan";

/** 20 AI requests per 10 minutes and 100 per day, per user, all kinds together. */
export const AI_WINDOW_SECONDS = 10 * 60;
export const AI_WINDOW_LIMIT = 20;
export const AI_DAILY_LIMIT = 100;

const fallbackLimiter = new RateLimiter(AI_WINDOW_LIMIT, AI_WINDOW_SECONDS * 1000);

/** Records one AI request for the signed-in user; false when over the limit. */
export async function takeAiQuota(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: AiUsageKind,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("take_ai_quota", {
    p_kind: kind,
    p_window_seconds: AI_WINDOW_SECONDS,
    p_window_limit: AI_WINDOW_LIMIT,
    p_daily_limit: AI_DAILY_LIMIT,
  });
  if (error) return fallbackLimiter.take(userId);
  return data === true;
}

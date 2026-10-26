/**
 * Small per-user sliding-window limiter to protect the free AI quota.
 * In-memory: per server instance, which is enough for a two-person app.
 */
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

/** 20 questions per 10 minutes per user. */
export const assistantLimiter = new RateLimiter(20, 10 * 60_000);

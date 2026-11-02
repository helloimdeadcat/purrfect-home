import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runDailyCleanup = vi.fn();
const buildMorningDigests = vi.fn();
const sendPushToUsers = vi.fn();
const dispatchAllPendingNotificationPushes = vi.fn();
let pushConfigured = true;

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/push/config", () => ({ isPushConfigured: () => pushConfigured }));
vi.mock("@/services/maintenance-service", () => ({ runDailyCleanup: (...a: unknown[]) => runDailyCleanup(...a) }));
vi.mock("@/services/summary-service", () => ({ buildMorningDigests: (...a: unknown[]) => buildMorningDigests(...a) }));
vi.mock("@/services/push-service", () => ({
  sendPushToUsers: (...a: unknown[]) => sendPushToUsers(...a),
  dispatchAllPendingNotificationPushes: (...a: unknown[]) =>
    dispatchAllPendingNotificationPushes(...a),
}));

const { GET } = await import("./route");

const call = (auth?: string) =>
  GET(new Request("https://app.test/api/cron/daily", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  pushConfigured = true;
  runDailyCleanup.mockReset().mockResolvedValue({ errors: 0, notifications_read: 2 });
  buildMorningDigests.mockReset().mockResolvedValue([{ userId: "u1", title: "Доброе утро", body: "3 дела", url: "/app/dashboard" }]);
  sendPushToUsers.mockReset().mockResolvedValue({ sent: 1, removed: 0 });
  dispatchAllPendingNotificationPushes
    .mockReset()
    .mockResolvedValue({ households: 0, notifications: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily", () => {
  it("rejects calls without the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(runDailyCleanup).not.toHaveBeenCalled();
  });

  it("cleans up and sends one digest push per member", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(sendPushToUsers).toHaveBeenCalledWith(["u1"], expect.objectContaining({ title: "Доброе утро", tag: "morning-digest" }));
    expect(await response.json()).toMatchObject({
      digest: { built: 1, sent: 1 },
      cleanup: { notifications_read: 2 },
      pendingPush: { households: 0, notifications: 0 },
    });
    expect(dispatchAllPendingNotificationPushes).toHaveBeenCalled();
  });

  it("skips the digest when push is not configured", async () => {
    pushConfigured = false;
    expect((await call("Bearer s3cret")).status).toBe(200);
    expect(buildMorningDigests).not.toHaveBeenCalled();
  });

  it("reports failure when cleanup had errors", async () => {
    runDailyCleanup.mockResolvedValue({ errors: 1 });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});

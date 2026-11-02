import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const events: string[] = [];
const sendNotification = vi.fn();
let admin: FakeAdmin;
const createAdminClient = vi.fn(() => admin);

vi.mock("web-push", () => ({
  default: { sendNotification: (...args: unknown[]) => sendNotification(...args) },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}));

const {
  dispatchPendingNotificationPushes,
  safePushUrl,
  sendPushToUsers,
} = await import("./push-service");

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Claimed = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  created_at: string;
};

class FakeAdmin {
  subscriptions: Sub[] = [];
  claimed: Claimed[] = [];
  deleted: string[][] = [];
  touched: string[][] = [];
  rpcCalls: { fn: string; args: unknown }[] = [];

  rpc(fn: string, args: unknown) {
    events.push(`rpc:${fn}`);
    this.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: this.claimed, error: null });
  }

  from(table: string) {
    if (table !== "push_subscriptions") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        in: (_column: string, userIds: string[]) =>
          Promise.resolve({
            data: this.subscriptions.filter((sub) => userIds.includes(sub.user_id)),
            error: null,
          }),
      }),
      delete: () => ({
        in: (_column: string, ids: string[]) => {
          this.deleted.push(ids);
          return Promise.resolve({ error: null });
        },
      }),
      update: () => ({
        in: (_column: string, ids: string[]) => {
          this.touched.push(ids);
          return Promise.resolve({ error: null });
        },
      }),
    };
  }
}

const ALICE = "user-alice";
const BOB = "user-bob";

function sub(id: string, userId: string): Sub {
  return { id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" };
}

function pushError(statusCode: number) {
  return Object.assign(new Error(`push failed ${statusCode}`), { statusCode });
}

beforeEach(() => {
  events.length = 0;
  admin = new FakeAdmin();
  createAdminClient.mockClear();
  sendNotification.mockReset().mockImplementation(async (subscription: { endpoint: string }) => {
    events.push(`send:${subscription.endpoint}`);
    return { statusCode: 201 };
  });
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendPushToUsers", () => {
  it("sends to every device of the users and records last_used_at", async () => {
    admin.subscriptions = [sub("a1", ALICE), sub("a2", ALICE), sub("b1", BOB)];

    const result = await sendPushToUsers([ALICE], { title: "Hi", body: "There", url: "/app/tasks" });

    expect(result).toEqual({ sent: 2, removed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, body, options] = sendNotification.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { vapidDetails: { publicKey: string } },
    ];
    expect(subscription.keys).toEqual({ p256dh: "k", auth: "a" });
    expect(JSON.parse(body)).toMatchObject({ title: "Hi", body: "There", url: "/app/tasks" });
    expect(options.vapidDetails.publicKey).toBe("public-key");
    expect(admin.touched).toEqual([["a1", "a2"]]);
    expect(admin.deleted).toEqual([]);
  });

  it("deletes subscriptions that answer 404 or 410, keeps others on transient errors", async () => {
    admin.subscriptions = [sub("gone", ALICE), sub("expired", ALICE), sub("flaky", ALICE), sub("ok", ALICE)];
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/gone")) throw pushError(410);
      if (subscription.endpoint.endsWith("/expired")) throw pushError(404);
      if (subscription.endpoint.endsWith("/flaky")) throw pushError(500);
      return { statusCode: 201 };
    });

    const result = await sendPushToUsers([ALICE], { title: "Hi", body: "x" });

    expect(result).toEqual({ sent: 1, removed: 2 });
    expect(admin.deleted).toHaveLength(1);
    expect([...admin.deleted[0]].sort()).toEqual(["expired", "gone"]);
    expect(admin.touched).toEqual([["ok"]]);
  });

  it("is a no-op without VAPID configuration", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    admin.subscriptions = [sub("a1", ALICE)];

    await expect(sendPushToUsers([ALICE], { title: "Hi", body: "x" })).resolves.toEqual({
      sent: 0,
      removed: 0,
    });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never sends off-site links", async () => {
    admin.subscriptions = [sub("a1", ALICE)];
    await sendPushToUsers([ALICE], { title: "Hi", body: "x", url: "https://evil.example" });
    const body = JSON.parse(sendNotification.mock.calls[0][1] as string) as { url: string };
    expect(body.url).toBe("/app/notifications");
    expect(safePushUrl("//evil.example")).toBe("/app/notifications");
    expect(safePushUrl("/\\evil.example")).toBe("/app/notifications");
    expect(safePushUrl("/app/tasks?id=1")).toBe("/app/tasks?id=1");
  });
});

describe("dispatchPendingNotificationPushes", () => {
  it("claims (marks pushed) before sending, one push per notification to its recipient", async () => {
    admin.subscriptions = [sub("a1", ALICE), sub("b1", BOB)];
    admin.claimed = [
      {
        id: "n1",
        user_id: BOB,
        type: "task_assigned",
        title: "New task",
        message: "Alice assigned you a task",
        link: "/app/tasks",
        created_at: new Date().toISOString(),
      },
    ];

    const count = await dispatchPendingNotificationPushes("household-1");

    expect(count).toBe(1);
    expect(admin.rpcCalls).toEqual([
      {
        fn: "claim_notification_pushes",
        args: { p_household_id: "household-1", p_limit: 20, p_max_age: "48 hours" },
      },
    ]);
    expect(events).toEqual(["rpc:claim_notification_pushes", "send:https://push.example/b1"]);
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string) as Record<string, string>;
    expect(payload).toMatchObject({
      title: "New task",
      body: "Alice assigned you a task",
      url: "/app/tasks",
      tag: "notification-n1",
    });
  });

  it("sends nothing when there is nothing to claim", async () => {
    admin.subscriptions = [sub("a1", ALICE)];
    await expect(dispatchPendingNotificationPushes("household-1")).resolves.toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("is a no-op without VAPID configuration", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    await expect(dispatchPendingNotificationPushes("household-1")).resolves.toBe(0);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("swallows a missing RPC (migration not applied)", async () => {
    admin.rpc = () => Promise.resolve({ data: null, error: { message: "function not found" } }) as never;
    await expect(dispatchPendingNotificationPushes("household-1")).resolves.toBe(0);
  });
});

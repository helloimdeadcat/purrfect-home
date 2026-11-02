import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let requestHeaders = new Headers();
const after = vi.fn();
const dispatch = vi.fn<(householdId: string) => Promise<number>>(async () => 0);

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/server", () => ({ after: (callback: () => unknown) => after(callback) }));
vi.mock("@/services/push-service", () => ({
  dispatchPendingNotificationPushes: (householdId: string) => dispatch(householdId),
}));

const { schedulePushDispatch, schedulePushDispatchAfterMutation } =
  await import("./dispatch");
const { REQUEST_METHOD_HEADER } = await import("./config");

beforeEach(() => {
  after.mockReset();
  dispatch.mockClear();
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
});

afterEach(() => vi.unstubAllEnvs());

describe("schedulePushDispatchAfterMutation", () => {
  it.each(["POST", "PATCH", "PUT", "DELETE"])("schedules a dispatch after %s", async (method) => {
    requestHeaders = new Headers({ [REQUEST_METHOD_HEADER]: method });
    await schedulePushDispatchAfterMutation("household-1");
    expect(after).toHaveBeenCalledTimes(1);

    const callback = after.mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(dispatch).toHaveBeenCalledWith("household-1");
  });

  it.each(["GET", "HEAD", "OPTIONS"])("does nothing for %s", async (method) => {
    requestHeaders = new Headers({ [REQUEST_METHOD_HEADER]: method });
    await schedulePushDispatchAfterMutation("household-1");
    expect(after).not.toHaveBeenCalled();
  });

  it("does nothing when the proxy header is missing", async () => {
    requestHeaders = new Headers();
    await schedulePushDispatchAfterMutation("household-1");
    expect(after).not.toHaveBeenCalled();
  });

  it("does nothing without VAPID configuration", async () => {
    vi.stubEnv("VAPID_SUBJECT", "");
    requestHeaders = new Headers({ [REQUEST_METHOD_HEADER]: "POST" });
    await schedulePushDispatchAfterMutation("household-1");
    expect(after).not.toHaveBeenCalled();
  });

  it("never throws outside a request scope", async () => {
    requestHeaders = new Headers({ [REQUEST_METHOD_HEADER]: "POST" });
    after.mockImplementation(() => {
      throw new Error("after() called outside a request scope");
    });
    await expect(schedulePushDispatchAfterMutation("household-1")).resolves.toBeUndefined();
  });
});

describe("schedulePushDispatch", () => {
  it("schedules regardless of HTTP method (invite accept path)", async () => {
    requestHeaders = new Headers({ [REQUEST_METHOD_HEADER]: "GET" });
    await schedulePushDispatch("household-invite");
    expect(after).toHaveBeenCalledTimes(1);
    const callback = after.mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(dispatch).toHaveBeenCalledWith("household-invite");
  });
});

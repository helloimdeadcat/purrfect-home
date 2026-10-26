import { describe, expect, it, vi } from "vitest";

import {
  TEST_HOUSEHOLD_ID,
  TEST_USER_ID,
  makeCtx,
} from "@/lib/test-utils/household-context";

import { listAuditLog } from "./audit-service";
import { markNotificationsRead } from "./notification-service";

describe("audit log access", () => {
  it.each(["member", "viewer"] as const)("forbids %s before querying", async (role) => {
    const from = vi.fn();
    const { error } = await listAuditLog({ from } as never, makeCtx({ role }));
    expect(error?.code).toBe("FORBIDDEN");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("markNotificationsRead", () => {
  it("only ever updates the caller's own unread notifications", async () => {
    const filters: [string, string, unknown][] = [];
    const chain = {
      update: vi.fn(() => chain),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(["eq", column, value]);
        return chain;
      }),
      in: vi.fn((column: string, value: unknown) => {
        filters.push(["in", column, value]);
        return chain;
      }),
      then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    };
    const supabase = { from: vi.fn(() => chain) };

    const { error } = await markNotificationsRead(supabase as never, makeCtx(), ["n1"]);

    expect(error).toBeNull();
    expect(chain.update).toHaveBeenCalledWith({ is_read: true });
    expect(filters).toEqual([
      ["eq", "user_id", TEST_USER_ID],
      ["eq", "household_id", TEST_HOUSEHOLD_ID],
      ["eq", "is_read", false],
      ["in", "id", ["n1"]],
    ]);
  });

  it("does nothing for an empty id list", async () => {
    const from = vi.fn();
    const { error } = await markNotificationsRead({ from } as never, makeCtx(), []);
    expect(error).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

import type { HouseholdContext } from "@/lib/auth/household";
import { confirmOccurrence } from "./recurring-service";

function makeCtx(overrides?: Partial<HouseholdContext>): HouseholdContext {
  return {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "owner@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as HouseholdContext["user"],
    membershipId: "22222222-2222-2222-2222-222222222222",
    householdId: "33333333-3333-3333-3333-333333333333",
    role: "owner",
    displayName: "Owner",
    currency: "EUR",
    householdName: "Test Family",
    ...overrides,
  };
}

const OCC_ID = "d825e2ed-52df-43cf-a525-345b06f458ab";

describe("confirmOccurrence service regression", () => {
  it("confirms overdue expense with amount 100.00 via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          occurrence_id: OCC_ID,
          transaction_id: "ffac7214-3980-4180-8a76-9813e0136f31",
          next_due_date: "2026-11-07",
        },
      ],
      error: null,
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: OCC_ID,
                household_id: "33333333-3333-3333-3333-333333333333",
                status: "overdue",
              },
              error: null,
            }),
          }),
        }),
      }),
    }));

    const { data, error } = await confirmOccurrence(
      { from, rpc } as never,
      makeCtx(),
      OCC_ID,
      { amount: "100.00" },
    );

    expect(error).toBeNull();
    expect(data?.transactionId).toBe("ffac7214-3980-4180-8a76-9813e0136f31");
    expect(rpc).toHaveBeenCalledWith("confirm_recurring_occurrence", {
      p_occurrence_id: OCC_ID,
      p_amount: "100.00",
      p_transaction_date: null,
      p_notes: null,
    });
  });

  it("rejects re-confirm of already paid occurrence without calling RPC", async () => {
    const rpc = vi.fn();
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: OCC_ID,
                household_id: "33333333-3333-3333-3333-333333333333",
                status: "paid",
              },
              error: null,
            }),
          }),
        }),
      }),
    }));

    const { error } = await confirmOccurrence(
      { from, rpc } as never,
      makeCtx(),
      OCC_ID,
      { amount: "100.00" },
    );

    expect(error?.code).toBe("CONFLICT");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC already-processed to CONFLICT (parallel duplicate)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Occurrence already processed" },
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: OCC_ID,
                household_id: "33333333-3333-3333-3333-333333333333",
                status: "overdue",
              },
              error: null,
            }),
          }),
        }),
      }),
    }));

    const { error } = await confirmOccurrence(
      { from, rpc } as never,
      makeCtx(),
      OCC_ID,
      { amount: "100.00" },
    );

    expect(error?.code).toBe("CONFLICT");
  });
});

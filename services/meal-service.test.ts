import { describe, expect, it, vi } from "vitest";

import { CATEGORY_LABEL } from "@/lib/meals/labels";
import { makeCtx, queryChain } from "@/lib/test-utils/household-context";

import { deleteFood, importSevenDayPlan, setPortions, shoppingText } from "./meal-service";

const MEAL = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const FOOD = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const A = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const B = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("setPortions", () => {
  it("upserts positive grams and deletes zeroed people", async () => {
    const calls: { op: string; arg?: unknown }[] = [];
    const chain = queryChain({ data: null, error: null }) as Record<string, unknown>;
    chain.upsert = (rows: unknown) => {
      calls.push({ op: "upsert", arg: rows });
      return Promise.resolve({ error: null });
    };
    chain.delete = () => {
      calls.push({ op: "delete" });
      return chain;
    };
    chain.in = (column: string, values: unknown) => {
      calls.push({ op: "in", arg: [column, values] });
      return chain;
    };
    const supabase = { from: vi.fn(() => chain) };

    const { error } = await setPortions(supabase as never, makeCtx(), {
      mealId: MEAL,
      foodId: FOOD,
      grams: [
        { memberId: A, grams: 45.04 },
        { memberId: B, grams: 0 },
      ],
    });
    expect(error).toBeNull();
    expect(calls[0]).toEqual({
      op: "upsert",
      arg: [expect.objectContaining({ member_id: A, grams: 45, food_id: FOOD, meal_id: MEAL })],
    });
    expect(calls).toContainEqual({ op: "in", arg: ["member_id", [B]] });
  });

  it("is forbidden for viewers", async () => {
    const from = vi.fn();
    const { error } = await setPortions({ from } as never, makeCtx({ role: "viewer" }), {
      mealId: MEAL,
      foodId: FOOD,
      grams: [{ memberId: A, grams: 10 }],
    });
    expect(error?.code).toBe("FORBIDDEN");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("deleteFood", () => {
  it("explains when a food is still used in the plan", async () => {
    const chain = queryChain({ data: null, error: null }) as Record<string, unknown>;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ error: { code: "23503", message: "fk" } });
    const { error } = await deleteFood({ from: () => chain } as never, makeCtx(), FOOD);
    expect(error?.code).toBe("CONFLICT");
    expect(error?.message).toMatch(/есть в плане/);
  });
});

describe("importSevenDayPlan", () => {
  it("refuses members from outside the household", async () => {
    const supabase = {
      from: vi.fn(() =>
        queryChain({
          data: [{ id: A, user_id: "u", role: "owner", display_name: "A", joined_at: "2026-01-01" }],
          error: null,
        }),
      ),
    };
    const { error } = await importSevenDayPlan(supabase as never, makeCtx(), {
      husbandMemberId: A,
      wifeMemberId: B,
      createHabits: false,
    });
    expect(error?.code).toBe("VALIDATION");
  });
});

describe("shoppingText", () => {
  it("groups by aisle and adds piece estimates", () => {
    const food = (name: string, extra: Record<string, unknown> = {}) =>
      ({ id: name, name, grams_per_piece: null, piece_label: null, ...extra }) as never;
    const text = shoppingText(
      {
        shopping: [
          { category: "meat_fish", lines: [{ food: food("Яйца", { grams_per_piece: "57", piece_label: "egg" }), grams: 510 }] },
          { category: "vegetables", lines: [{ food: food("Помидоры"), grams: 4940 }] },
        ],
      },
      CATEGORY_LABEL,
    );
    expect(text).toBe("Мясо, рыба и яйца\n• Яйца — 510 г (≈9 egg)\n\nОвощи\n• Помидоры — 4,94 кг");
  });
});

import { describe, expect, it } from "vitest";

import {
  aggregateShopping,
  formatGrams,
  macrosFor,
  rangeStatus,
  totalsByMember,
  type Portion,
} from "@/lib/calculations/nutrition";

import { PLAN_FOODS, PLAN_MEALS } from "./seven-day-plan";

const foods = new Map(PLAN_FOODS.map((f) => [f.key, f]));

function mealPortions(meal: (typeof PLAN_MEALS)[number]): Portion[] {
  return meal.items.flatMap(([foodId, husband, wife]) => [
    { foodId, memberId: "husband", grams: husband },
    { foodId, memberId: "wife", grams: wife },
  ]);
}

describe("7-day plan transcription", () => {
  it("has 7 days × 4 meals and only known foods", () => {
    expect(PLAN_MEALS).toHaveLength(28);
    for (let day = 1; day <= 7; day += 1) {
      expect(PLAN_MEALS.filter((m) => m.weekday === day).map((m) => m.slot)).toEqual([
        "breakfast",
        "lunch",
        "dinner",
        "snack",
      ]);
    }
    for (const meal of PLAN_MEALS) {
      for (const [key] of meal.items) expect(foods.has(key), key).toBe(true);
    }
  });

  it("recomputed meal calories match the PDF's own totals (±6%)", () => {
    const off: string[] = [];
    for (const meal of PLAN_MEALS) {
      const totals = totalsByMember(mealPortions(meal), foods);
      const [h, w] = meal.pdfKcal;
      for (const [who, expected] of [
        ["husband", h],
        ["wife", w],
      ] as const) {
        const got = totals.get(who)!.kcal;
        if (Math.abs(got - expected) / expected > 0.06) {
          off.push(`day ${meal.weekday} ${meal.slot} ${who}: ${Math.round(got)} vs ${expected}`);
        }
      }
    }
    expect(off).toEqual([]);
  });

  it("weekly daily average lands near the plan's 1788 / 1431 kcal", () => {
    const all = PLAN_MEALS.flatMap(mealPortions);
    const totals = totalsByMember(all, foods);
    expect(totals.get("husband")!.kcal / 7).toBeGreaterThan(1788 * 0.95);
    expect(totals.get("husband")!.kcal / 7).toBeLessThan(1788 * 1.05);
    expect(totals.get("wife")!.kcal / 7).toBeGreaterThan(1431 * 0.95);
    expect(totals.get("wife")!.kcal / 7).toBeLessThan(1431 * 1.05);
  });

  it("shopping list matches the plan's purchase quantities", () => {
    const lines = new Map(aggregateShopping(PLAN_MEALS.flatMap(mealPortions)).map((l) => [l.foodId, l.grams]));
    // Section 5 buys with a little slack: chicken ≈2.1–2.2 kg (plan uses 2.07),
    // salmon 650–700 g (plan uses 630), skyr ≈3.2 kg, quark ≈2 kg.
    expect(lines.get("chicken")).toBe(2070);
    expect(lines.get("salmon")).toBe(630);
    expect(lines.get("skyr")).toBeGreaterThan(3000);
    expect(lines.get("quark")).toBeGreaterThan(1800);
  });
});

describe("nutrition helpers", () => {
  it("scales per-100 g values", () => {
    expect(macrosFor({ kcal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 }, 10)).toEqual({
      kcal: 88.4,
      protein: 0,
      fat: 10,
      carbs: 0,
      fiber: 0,
    });
  });

  it("classifies ranges and formats grams", () => {
    expect(rangeStatus(120, 130, 160)).toBe("below");
    expect(rangeStatus(140, 130, 160)).toBe("within");
    expect(rangeStatus(170, 130, 160)).toBe("above");
    expect(rangeStatus(170, null, null)).toBe("none");
    expect(formatGrams(2150)).toBe("2.15 kg");
    expect(formatGrams(85)).toBe("85 g");
  });
});

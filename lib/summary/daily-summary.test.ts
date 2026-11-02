import { describe, expect, it } from "vitest";

import type { HabitRules } from "@/lib/calculations/habits";
import type { AgendaItem } from "@/lib/calculations/task-schedule";

import {
  askMortyHref,
  countTasks,
  digestParts,
  formatDigest,
  groupCheckins,
  joinWithin,
  paymentsWord,
  pendingHabits,
  settleSection,
  shortMoney,
  summarizeMealsDay,
  summarizeMoney,
  tasksWord,
  type DigestInput,
  type SummaryHabit,
} from "./daily-summary";

const ME = "me";
const PARTNER = "partner";
const TODAY = "2026-10-27"; // Tuesday

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    key: "t:2026-10-27",
    taskId: "t",
    date: TODAY,
    title: "Task",
    kind: "task",
    startTime: null,
    endTime: null,
    assigneeMemberId: null,
    repeating: false,
    done: false,
    overdue: false,
    ...overrides,
  };
}

describe("countTasks", () => {
  it("splits open items into mine / together / partner and counts overdue + done", () => {
    const counts = countTasks(
      [
        item({ assigneeMemberId: ME }),
        item({ assigneeMemberId: null }),
        item({ assigneeMemberId: null, overdue: true, date: "2026-10-20" }),
        item({ assigneeMemberId: PARTNER }),
        item({ assigneeMemberId: ME, done: true }),
      ],
      ME,
    );
    expect(counts).toEqual({ open: 4, done: 1, overdue: 1, mine: 1, together: 2, partner: 1 });
  });
});

describe("plural forms", () => {
  it("uses Russian forms", () => {
    expect(`1 ${tasksWord(1)}`).toBe("1 дело");
    expect(`3 ${tasksWord(3)}`).toBe("3 дела");
    expect(`5 ${tasksWord(5)}`).toBe("5 дел");
    expect(`21 ${paymentsWord(21)}`).toBe("21 платёж");
    expect(`2 ${paymentsWord(2)}`).toBe("2 платежа");
    expect(`11 ${paymentsWord(11)}`).toBe("11 платежей");
  });
});

describe("summarizeMealsDay", () => {
  it("sums kcal per member, picks the first meal and attaches targets", () => {
    const day = summarizeMealsDay({
      hasPlan: true,
      meals: [
        { id: "dinner", slot: "dinner", title: "Рыба", position: 0 },
        { id: "breakfast", slot: "breakfast", title: "Овсянка", position: 0 },
      ],
      portions: [
        { mealId: "breakfast", foodId: "oats", memberId: ME, grams: 100 },
        { mealId: "breakfast", foodId: "oats", memberId: PARTNER, grams: 50 },
        { mealId: "dinner", foodId: "fish", memberId: ME, grams: 200 },
      ],
      kcalPer100g: new Map([
        ["oats", 370],
        ["fish", 105.4],
      ]),
      targets: [
        { member_id: ME, kcal: 1800 },
        { member_id: "nobody-eats", kcal: null },
      ],
    });
    expect(day.meals.map((m) => m.slot)).toEqual(["breakfast", "dinner"]);
    expect(day.byMember[ME]).toEqual({
      memberId: ME,
      kcal: 581,
      firstMealKcal: 370,
      firstMealSlot: "breakfast",
      targetKcal: 1800,
    });
    expect(day.byMember[PARTNER].kcal).toBe(185);
    expect(day.byMember[PARTNER].targetKcal).toBeNull();
    expect(day.byMember["nobody-eats"]).toBeUndefined();
  });
});

describe("pendingHabits", () => {
  const daily: HabitRules = { startDate: "2026-01-01", frequency: { kind: "daily" }, goal: { kind: "check" } };
  const habits: SummaryHabit[] = [
    { id: "water", title: "Вода", emoji: "💧", ownerMemberId: null, rules: { ...daily, goal: { kind: "count", target: 2, unit: "л" } } },
    { id: "read", title: "Чтение", emoji: null, ownerMemberId: null, rules: daily },
    { id: "theirs", title: "Партнёра", emoji: null, ownerMemberId: PARTNER, rules: daily },
    // Mon/Thu only — not today (Tuesday).
    { id: "gym", title: "Силовая", emoji: null, ownerMemberId: null, rules: { ...daily, frequency: { kind: "days", weekdays: [1, 4] } } },
    { id: "run", title: "Бег", emoji: null, ownerMemberId: ME, rules: { ...daily, frequency: { kind: "per_week", times: 1 } } },
    { id: "future", title: "Потом", emoji: null, ownerMemberId: null, rules: { ...daily, startDate: "2026-11-01" } },
  ];

  it("lists habits scheduled today and not done for this member", () => {
    const checkins = groupCheckins([
      { habit_id: "water", member_id: ME, checkin_date: TODAY, value: "1.00" }, // partial
      { habit_id: "read", member_id: ME, checkin_date: TODAY, value: 1 }, // done
      { habit_id: "run", member_id: ME, checkin_date: "2026-10-26", value: 1 }, // weekly target met on Monday
    ]);
    expect(pendingHabits(habits, checkins, ME, TODAY).map((h) => h.id)).toEqual(["water"]);
    expect(pendingHabits(habits, new Map(), PARTNER, TODAY).map((h) => h.id)).toEqual(["water", "read", "theirs"]);
  });
});

describe("summarizeMoney", () => {
  it("uses the base currency and counts expense obligations due by today", () => {
    const money = summarizeMoney({
      baseCurrency: "eur",
      today: TODAY,
      currencies: [
        { currency: "USD", safeToSpend: "10.00", isDeficit: false },
        { currency: "EUR", safeToSpend: "85.40", isDeficit: false },
      ],
      obligations: [
        { name: "Квартира", amount: "700.00", currency: "EUR", date: TODAY, cashFlow: "expense" },
        { name: "Интернет", amount: "30.00", currency: "EUR", date: "2026-10-20", cashFlow: "expense" },
        { name: "Свет", amount: "50.00", currency: "EUR", date: "2026-10-30", cashFlow: "expense" },
        { name: "Зарплата", amount: "2000.00", currency: "EUR", date: TODAY, cashFlow: "income" },
      ],
    });
    expect(money).toMatchObject({ currency: "EUR", safeToSpend: "85.40", dueToday: 1, overdue: 1 });
    expect(money!.due.map((d) => d.name)).toEqual(["Интернет", "Квартира"]);
  });

  it("returns null without any currency", () => {
    expect(summarizeMoney({ baseCurrency: "EUR", today: TODAY, currencies: [], obligations: [] })).toBeNull();
  });
});

describe("digest text", () => {
  const full: DigestInput = {
    displayName: "Эмма",
    tasks: { open: 3, together: 1, overdue: 0 },
    meal: { slot: "breakfast", kcal: 420, dayKcal: 1650 },
    habitsPending: 2,
    money: { safeToSpend: "85.40", currency: "EUR", isDeficit: false, duePayments: 0 },
  };

  it("builds a short body like the spec example", () => {
    const digest = formatDigest(full)!;
    expect(digest.title).toBe("Доброе утро, Эмма! ☀️");
    expect(digest.body).toBe(
      `3 дела (1 вместе) · завтрак 420 ккал · 2 привычки · можно потратить ${shortMoney("85.40", "EUR")}`,
    );
    expect(digest.body.length).toBeLessThanOrEqual(160);
  });

  it("mentions overdue, due payments, day kcal and deficit", () => {
    const parts = digestParts({
      displayName: null,
      tasks: { open: 1, together: 0, overdue: 1 },
      meal: { slot: null, kcal: 0, dayKcal: 1500 },
      habitsPending: 0,
      money: { safeToSpend: "-20.00", currency: "EUR", isDeficit: true, duePayments: 2 },
    });
    expect(parts[0]).toBe("1 дело (1 просроч.)");
    expect(parts[1]).toBe("2 платежа к оплате");
    expect(parts[2]).toBe("1500 ккал за день");
    expect(parts[3]).toMatch(/^денег впритык: /);
  });

  it("skips members with nothing to say (money alone is not news)", () => {
    expect(
      formatDigest({
        displayName: null,
        tasks: { open: 0, together: 0, overdue: 0 },
        meal: null,
        habitsPending: 0,
        money: { safeToSpend: "100.00", currency: "EUR", isDeficit: false, duePayments: 0 },
      }),
    ).toBeNull();
    expect(formatDigest({ displayName: null, tasks: null, meal: null, habitsPending: null, money: null })).toBeNull();
  });

  it("keeps unavailable sections out of the text", () => {
    const digest = formatDigest({ ...full, displayName: null, meal: null, money: null });
    expect(digest).toEqual({ title: "Доброе утро! ☀️", body: "3 дела (1 вместе) · 2 привычки" });
  });

  it("drops trailing parts to stay within 160 chars", () => {
    const long = "x".repeat(100);
    expect(joinWithin([long, long, "short"])).toBe(long);
    expect(joinWithin(["y".repeat(200)])).toHaveLength(160);
    expect(joinWithin(["a", "b"], 5)).toBe("a · b");
  });
});

describe("settleSection", () => {
  it("degrades errors, nulls and throws to unavailable", async () => {
    expect(await settleSection(async () => ({ data: 1, error: null }))).toEqual({ ok: true, data: 1 });
    expect(await settleSection(async () => ({ data: null, error: { message: "relation does not exist" } }))).toEqual({ ok: false });
    expect(await settleSection(async () => ({ data: null, error: null }))).toEqual({ ok: false });
    expect(
      await settleSection(async () => {
        throw new Error("boom");
      }),
    ).toEqual({ ok: false });
  });
});

describe("askMortyHref", () => {
  it("prefills an encoded Russian question", () => {
    const href = askMortyHref();
    expect(href.startsWith("/app/assistant?q=")).toBe(true);
    expect(decodeURIComponent(href.split("q=")[1])).toMatch(/^Что у нас сегодня\?/);
  });
});

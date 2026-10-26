import type { SupabaseClient } from "@supabase/supabase-js";

import { chatCompletion, type ChatMessage } from "@/lib/ai/client";
import type { AiConfig } from "@/lib/ai/config";
import { ASSISTANT_TOOLS, parseProposal, type Proposal } from "@/lib/ai/tools";
import type { HouseholdContext } from "@/lib/auth/household";
import { addDays, daysBetween } from "@/lib/calculations/task-schedule";
import { describeFrequency, describeStreak } from "@/lib/habits/describe";
import { SLOT_LABEL } from "@/lib/meals/labels";
import { describeRepeat, describeTime, WEEKDAY_SHORT } from "@/lib/tasks/describe";
import { listAccountsWithBalances, summarizeHouseholdWealth } from "@/services/account-service";
import { loadHabitBoard } from "@/services/habit-service";
import { loadMealPlanView, setPortions, updateMeal, type MealPlanView } from "@/services/meal-service";
import { getHouseholdToday } from "@/services/settings-service";
import { createTask, rowToRepeat, updateTask } from "@/services/task-service";
import { loadTaskView, type TaskView } from "@/services/task-view-service";
import { monthlyIncomeExpense } from "@/services/transaction-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ProposalCard = { id: string; summary: string; proposal: Proposal };

export type AssistantReply = { reply: string; proposals: ProposalCard[] };

/** Rounds of tool calls before we stop and answer with what we have. */
const MAX_ROUNDS = 5;
/** Keep tool payloads small for the free tier's token limits. */
const MAX_TOOL_CHARS = 12_000;

/** Lazily loaded, per-request data for the tools. */
class DataScope {
  private meals?: Promise<MealPlanView | null>;
  private today?: Promise<{ timezone: string; today: string }>;

  constructor(
    readonly supabase: AppSupabase,
    readonly ctx: HouseholdContext,
  ) {}

  todayInfo() {
    return (this.today ??= getHouseholdToday(this.supabase, this.ctx));
  }

  mealView() {
    return (this.meals ??= loadMealPlanView(this.supabase, this.ctx).then((r) => r.data));
  }

  async tasks(from: string, to: string): Promise<TaskView | null> {
    return (await loadTaskView(this.supabase, this.ctx, { from, to })).data;
  }
}

function round(n: number): number {
  return Math.round(n);
}

async function safe<T>(load: () => Promise<T>): Promise<T | "unavailable"> {
  try {
    return await load();
  } catch {
    return "unavailable";
  }
}

function personName(view: MealPlanView | TaskView | null, memberId: string | null): string {
  if (memberId === null) return "together";
  return view?.people.byMemberId.get(memberId)?.label ?? "partner";
}

function mealsOfDay(view: MealPlanView, weekday: number) {
  const foods = new Map(view.foods.map((f) => [f.id, f]));
  return view.meals
    .filter((m) => m.weekday === weekday)
    .map((meal) => {
      const portions = view.portionsByMeal[meal.id] ?? [];
      const foodIds = [...new Set(portions.map((p) => p.food_id))];
      return {
        meal_id: meal.id,
        slot: SLOT_LABEL[meal.slot],
        dish: meal.title,
        ingredients: foodIds.map((foodId) => ({
          food_id: foodId,
          food: foods.get(foodId)?.name,
          weighed: foods.get(foodId)?.weigh_mode,
          grams: Object.fromEntries(
            portions.filter((p) => p.food_id === foodId).map((p) => [personName(view, p.member_id), Number(p.grams)]),
          ),
        })),
        kcal: Object.fromEntries(
          Object.entries(view.mealTotals[meal.id] ?? {}).map(([memberId, m]) => [personName(view, memberId), round(m.kcal)]),
        ),
      };
    });
}

async function runReadTool(scope: DataScope, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { today } = await scope.todayInfo();
  switch (name) {
    case "get_overview": {
      const [tasks, habits, meals, money] = await Promise.all([
        safe(() => scope.tasks(today, today)),
        safe(async () => (await loadHabitBoard(scope.supabase, scope.ctx)).data),
        safe(() => scope.mealView()),
        safe(async () => {
          const accounts = (await listAccountsWithBalances(scope.supabase, scope.ctx)).data ?? [];
          const wealth = summarizeHouseholdWealth(accounts, scope.ctx.currency);
          const month = (await monthlyIncomeExpense(scope.supabase, scope.ctx, Number(today.slice(0, 4)), Number(today.slice(5, 7)))).data;
          return {
            balances: [{ currency: wealth.baseCurrency, total: wealth.baseTotal }, ...wealth.otherCurrencies.map((c) => ({ currency: c.currency, total: c.total }))],
            this_month: month ? { currency: month.currency, income: month.income, expense: month.expense } : null,
          };
        }),
      ]);
      const people = tasks !== "unavailable" && tasks ? tasks.people.list : [];
      const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      return {
        today,
        weekday: WEEKDAY_SHORT[weekday - 1],
        partners: people.map((p) => ({ member_id: p.memberId, name: p.label, is_you: p.isYou })),
        todays_meals: meals !== "unavailable" && meals ? mealsOfDay(meals, weekday).map((m) => ({ slot: m.slot, dish: m.dish, kcal: m.kcal })) : "no meal plan",
        todays_tasks:
          tasks !== "unavailable" && tasks
            ? [...tasks.agenda.overdue, ...(tasks.agenda.byDate[today] ?? [])].map((i) => ({
                task_id: i.taskId,
                title: i.title,
                who: personName(tasks, i.assigneeMemberId),
                time: describeTime(i.startTime, i.endTime),
                done: i.done,
                overdue: i.overdue,
              }))
            : "unavailable",
        habits_today:
          habits !== "unavailable" && habits
            ? habits.habits.map((h) => ({
                habit: h.habit.title,
                people: h.participants.map((p) => ({ name: p.person.label, today: p.todayValue, streak: describeStreak(p.streak) })),
              }))
            : "unavailable",
        money,
      };
    }
    case "get_day_meals": {
      const weekday = Number(args.weekday);
      if (!(weekday >= 1 && weekday <= 7)) return { error: "weekday must be 1–7" };
      const view = await scope.mealView();
      if (!view?.plan) return { error: "No meal plan yet" };
      const totals = view.dayTotals[weekday] ?? {};
      return {
        weekday: WEEKDAY_SHORT[weekday - 1],
        meals: mealsOfDay(view, weekday),
        day_totals: Object.fromEntries(
          Object.entries(totals).map(([memberId, m]) => [
            personName(view, memberId),
            { kcal: round(m.kcal), protein: round(m.protein), fat: round(m.fat), carbs: round(m.carbs) },
          ]),
        ),
        targets: Object.fromEntries(
          Object.entries(view.targets).map(([memberId, t]) => [personName(view, memberId), { kcal: t.kcal, protein: [t.protein_min, t.protein_max], fat: [t.fat_min, t.fat_max] }]),
        ),
      };
    }
    case "get_agenda": {
      const from = String(args.from ?? today);
      const to = String(args.to ?? addDays(today, 6));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || daysBetween(from, to) > 31) {
        return { error: "Use YYYY-MM-DD dates, at most 31 days apart" };
      }
      const view = await scope.tasks(from, to);
      if (!view) return { error: "To-dos are unavailable" };
      const item = (i: TaskView["agenda"]["overdue"][number]) => {
        const task = view.taskById.get(i.taskId);
        return {
          task_id: i.taskId,
          title: i.title,
          date: i.date,
          time: describeTime(i.startTime, i.endTime),
          who: personName(view, i.assigneeMemberId),
          repeat: task ? describeRepeat(rowToRepeat(task)) : null,
          done: i.done,
        };
      };
      return {
        overdue: view.agenda.overdue.map(item),
        by_date: Object.fromEntries(Object.entries(view.agenda.byDate).map(([d, items]) => [d, items.map(item)])),
        someday: view.agenda.someday.map(item),
      };
    }
    case "get_habits": {
      const board = (await loadHabitBoard(scope.supabase, scope.ctx)).data;
      if (!board) return { error: "Habits are unavailable" };
      return board.habits.map((h) => ({
        habit: h.habit.title,
        how_often: describeFrequency(h.rules.frequency),
        goal: h.rules.goal.kind === "count" ? `${h.rules.goal.target} ${h.rules.goal.unit ?? ""}`.trim() : "tick",
        people: h.participants.map((p) => ({
          name: p.person.label,
          today: p.todayValue,
          streak: describeStreak(p.streak),
          last_30_days: p.rate30 === null ? null : `${Math.round(p.rate30 * 100)}%`,
        })),
      }));
    }
    case "get_foods": {
      const view = await scope.mealView();
      return (view?.foods ?? []).map((f) => ({
        food_id: f.id,
        name: f.name,
        per_100g: { kcal: Number(f.kcal), protein: Number(f.protein), fat: Number(f.fat), carbs: Number(f.carbs) },
      }));
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

/** Human-readable card text built from validated data — never from the model's prose. */
async function describeProposal(scope: DataScope, proposal: Proposal): Promise<string> {
  const { today } = await scope.todayInfo();
  switch (proposal.type) {
    case "create_task": {
      const view = await scope.tasks(today, today);
      const i = proposal.input;
      const when = [i.startDate, describeTime(i.startTime ?? null, i.endTime ?? null)].filter(Boolean).join(" ");
      const repeat = i.repeat ? describeRepeat(i.repeat) : null;
      return `Add "${i.title}" for ${personName(view, i.assigneeMemberId ?? null)}${when ? ` · ${when}` : ""}${repeat ? ` · ${repeat}` : ""}`;
    }
    case "update_task": {
      const view = await scope.tasks(today, today);
      const task = view?.taskById.get(proposal.taskId);
      const i = proposal.input;
      const changes = [
        i.title !== undefined ? `rename to "${i.title}"` : null,
        i.assigneeMemberId !== undefined ? `assign to ${personName(view, i.assigneeMemberId ?? null)}` : null,
        i.startDate !== undefined ? `move to ${i.startDate ?? "no date"}` : null,
        i.startTime !== undefined ? (i.startTime ? `at ${describeTime(i.startTime, i.endTime ?? null)}` : "remove the time") : null,
        i.repeat !== undefined ? `repeat: ${describeRepeat(i.repeat) ?? "none"}` : null,
      ].filter(Boolean);
      return `Change "${task?.title ?? "a task"}": ${changes.join(", ") || "no visible change"}`;
    }
    case "set_meal_portions": {
      const view = await scope.mealView();
      const meal = view?.meals.find((m) => m.id === proposal.input.mealId);
      const food = view?.foods.find((f) => f.id === proposal.input.foodId);
      const grams = proposal.input.grams.map((g) => `${personName(view ?? null, g.memberId)} ${g.grams} g`).join(", ");
      return `${meal ? `${WEEKDAY_SHORT[meal.weekday - 1]} ${SLOT_LABEL[meal.slot]}` : "Meal"}: ${food?.name ?? "food"} → ${grams}`;
    }
    case "rename_meal": {
      const view = await scope.mealView();
      const meal = view?.meals.find((m) => m.id === proposal.mealId);
      return `Rename "${meal?.title ?? "meal"}" → "${proposal.title}"`;
    }
  }
}

function systemPrompt(today: string, timezone: string, userName: string | null): string {
  const weekday = WEEKDAY_SHORT[((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)];
  return [
    "You are Purrfect, the warm and concise assistant inside Purrfect Home — a home organiser for a couple (money, shared to-dos and schedule, habits, meal plan).",
    `Today is ${weekday} ${today} (${timezone}).${userName ? ` You are talking to ${userName}.` : ""}`,
    "Rules:",
    "- Get facts with the get_* tools; never invent data, amounts, dates or ids. Call get_overview first if you need the partners' member_id.",
    "- You cannot change anything yourself. To suggest a change call a propose_* tool; the user sees a card and decides. Never say a change is done.",
    "- Recipes: use get_day_meals for the meal's ingredients and each person's grams; keep the planned portions, give short numbered steps and approximate kcal per person from the totals. Mention weighing rules (dry/raw weight) when relevant.",
    "- Nutrition and health: general guidance only, no medical advice.",
    "- Money: keep amounts per currency, never convert currencies.",
    "- Answer in the user's language (Russian if they write in Russian). Be brief: short paragraphs or bullet points. A little warmth is welcome (an occasional ♥ or 🐾), not on every line.",
  ].join("\n");
}

/**
 * One assistant turn: the model may call read tools (run as this user) and
 * propose changes (returned as cards). Nothing is written here.
 */
export async function runAssistant(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  history: ChatTurn[],
  config: AiConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AssistantReply> {
  const scope = new DataScope(supabase, ctx);
  const { today, timezone } = await scope.todayInfo();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(today, timezone, ctx.displayName) },
    ...history.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
  ];
  const proposals: ProposalCard[] = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await chatCompletion(config, { messages, tools: ASSISTANT_TOOLS }, fetchImpl);
    if (result.toolCalls.length === 0) {
      return { reply: result.content?.trim() || "…", proposals };
    }

    messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Arguments were not valid JSON" }) });
        continue;
      }

      let content: unknown;
      if (call.function.name.startsWith("propose_")) {
        const parsed = parseProposal(call.function.name, args);
        if (parsed.ok) {
          const id = `p${proposals.length + 1}`;
          proposals.push({ id, summary: await describeProposal(scope, parsed.proposal), proposal: parsed.proposal });
          content = { status: "shown_to_user", note: "The user will apply or dismiss this card. Do not claim it is done." };
        } else {
          content = { error: parsed.message };
        }
      } else {
        content = await runReadTool(scope, call.function.name, args).catch(() => ({ error: "Could not load this data" }));
      }
      const text = JSON.stringify(content);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: text.length > MAX_TOOL_CHARS ? `${text.slice(0, MAX_TOOL_CHARS)}…(truncated)` : text,
      });
    }
  }

  return {
    reply: proposals.length > 0 ? "Here is what I suggest:" : "Sorry, I couldn't finish that — try asking more specifically.",
    proposals,
  };
}

/** Apply a proposal the user confirmed, through the normal services and rules. */
export async function applyProposal(supabase: AppSupabase, ctx: HouseholdContext, proposal: Proposal) {
  switch (proposal.type) {
    case "create_task":
      return { error: (await createTask(supabase, ctx, proposal.input)).error };
    case "update_task":
      return { error: (await updateTask(supabase, ctx, proposal.taskId, proposal.input)).error };
    case "set_meal_portions":
      return { error: (await setPortions(supabase, ctx, proposal.input)).error };
    case "rename_meal":
      return { error: (await updateMeal(supabase, ctx, proposal.mealId, { title: proposal.title })).error };
  }
}

/**
 * Tools exposed to the assistant model.
 *
 * - get_* tools are read-only and run immediately (as the signed-in user,
 *   so RLS applies).
 * - propose_* tools never change anything: they become proposal cards the
 *   user must apply. Proposals are validated here when the model emits them
 *   and validated again on apply.
 */
import { z } from "zod";

import type { ChatTool } from "@/lib/ai/client";
import { createTaskSchema, taskRepeatSchema, updateTaskSchema } from "@/lib/validations/task";
import { setPortionsSchema } from "@/lib/validations/meal";

const date = { type: "string", description: "YYYY-MM-DD" };
const time = { type: "string", description: "HH:MM, 24h" };
const who = {
  type: "string",
  description: 'member_id of one partner (from get_overview), or "together" for both',
};
const repeat = {
  type: "object",
  description: "Repeat rule; omit for a one-off",
  properties: {
    kind: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
    interval: { type: "integer", description: "every N days/weeks/months, default 1" },
    weekdays: { type: "array", items: { type: "integer" }, description: "weekly: ISO weekdays 1=Mon … 7=Sun" },
    day_of_month: { type: "integer", description: "monthly: 1–31" },
  },
  required: ["kind"],
};

function tool(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ChatTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

export const ASSISTANT_TOOLS: ChatTool[] = [
  tool(
    "get_overview",
    "Today's date, the two partners with their member_id, today's meals, to-dos, habits and a short money summary. Call this first.",
  ),
  tool(
    "get_day_meals",
    "Meals of one weekday in the meal plan with every ingredient and grams per person, plus calorie/macro totals. Use for recipes and portion questions.",
    { weekday: { type: "integer", description: "1=Mon … 7=Sun" } },
    ["weekday"],
  ),
  tool(
    "get_agenda",
    "Shared to-dos and schedule between two dates (max 31 days), with task_id, who, time, repeat and done state.",
    { from: date, to: date },
    ["from", "to"],
  ),
  tool("get_habits", "All habits with each partner's streak, today's progress and 30-day completion."),
  tool("get_foods", "The food catalogue with food_id and calories/protein/fat/carbs per 100 g."),
  tool(
    "propose_create_task",
    "Suggest adding a to-do (no time) or schedule event (with start_time). Nothing changes until the user taps Apply.",
    { title: { type: "string" }, who, date, start_time: time, end_time: time, repeat, notes: { type: "string" } },
    ["title", "who"],
  ),
  tool(
    "propose_update_task",
    "Suggest changing an existing to-do/event (move date or time, reassign, rename, change repeat). Only include fields that change. Use an empty string for start_time to remove the time.",
    { task_id: { type: "string" }, title: { type: "string" }, who, date, start_time: time, end_time: time, repeat },
    ["task_id"],
  ),
  tool(
    "propose_set_meal_portions",
    "Suggest new grams of one food in one planned meal, per person (0 removes that person's portion).",
    {
      meal_id: { type: "string" },
      food_id: { type: "string" },
      grams: {
        type: "array",
        items: {
          type: "object",
          properties: { member_id: { type: "string" }, grams: { type: "number" } },
          required: ["member_id", "grams"],
        },
      },
    },
    ["meal_id", "food_id", "grams"],
  ),
  tool(
    "propose_rename_meal",
    "Suggest a new dish name for a planned meal.",
    { meal_id: { type: "string" }, title: { type: "string" } },
    ["meal_id", "title"],
  ),
];

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export const proposalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), input: createTaskSchema }),
  z.object({ type: z.literal("update_task"), taskId: z.uuid(), input: updateTaskSchema }),
  z.object({ type: z.literal("set_meal_portions"), input: setPortionsSchema }),
  z.object({
    type: z.literal("rename_meal"),
    mealId: z.uuid(),
    title: z.string().trim().min(1).max(160),
  }),
]);

export type Proposal = z.infer<typeof proposalSchema>;

const modelRepeat = z
  .object({
    kind: z.enum(["none", "daily", "weekly", "monthly"]),
    interval: z.number().int().optional(),
    weekdays: z.array(z.number().int()).optional(),
    day_of_month: z.number().int().optional(),
  })
  .optional();

function toRepeat(raw: z.infer<typeof modelRepeat>, startDate?: string | null) {
  if (!raw) return undefined;
  const interval = raw.interval && raw.interval > 0 ? raw.interval : 1;
  switch (raw.kind) {
    case "none":
      return taskRepeatSchema.parse({ kind: "none" });
    case "daily":
      return taskRepeatSchema.parse({ kind: "daily", interval });
    case "weekly":
      return taskRepeatSchema.parse({ kind: "weekly", interval, weekdays: raw.weekdays ?? [] });
    case "monthly":
      return taskRepeatSchema.parse({
        kind: "monthly",
        interval,
        dayOfMonth: raw.day_of_month ?? (startDate ? Number(startDate.slice(8, 10)) : 1),
      });
  }
}

function toAssignee(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  return raw === "together" || raw === "" ? null : raw;
}

const createArgs = z.object({
  title: z.string(),
  who: z.string(),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  repeat: modelRepeat,
  notes: z.string().optional(),
});

const updateArgs = z.object({
  task_id: z.string(),
  title: z.string().optional(),
  who: z.string().optional(),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  repeat: modelRepeat,
});

/**
 * Turn a propose_* tool call into a validated proposal, or explain to the
 * model what was wrong so it can retry.
 */
export function parseProposal(
  name: string,
  args: unknown,
): { ok: true; proposal: Proposal } | { ok: false; message: string } {
  try {
    switch (name) {
      case "propose_create_task": {
        const a = createArgs.parse(args);
        const input = createTaskSchema.parse({
          title: a.title,
          assigneeMemberId: toAssignee(a.who),
          startDate: a.date || null,
          startTime: a.start_time || null,
          endTime: a.end_time || null,
          repeat: toRepeat(a.repeat, a.date) ?? { kind: "none" },
          notes: a.notes || null,
        });
        return { ok: true, proposal: { type: "create_task", input } };
      }
      case "propose_update_task": {
        const a = updateArgs.parse(args);
        const input = updateTaskSchema.parse({
          title: a.title,
          assigneeMemberId: toAssignee(a.who),
          startDate: a.date,
          startTime: a.start_time === undefined ? undefined : a.start_time || null,
          endTime: a.end_time === undefined ? undefined : a.end_time || null,
          repeat: toRepeat(a.repeat, a.date),
        });
        return { ok: true, proposal: { type: "update_task", taskId: z.uuid().parse(a.task_id), input } };
      }
      case "propose_set_meal_portions": {
        const a = z
          .object({
            meal_id: z.string(),
            food_id: z.string(),
            grams: z.array(z.object({ member_id: z.string(), grams: z.number() })),
          })
          .parse(args);
        const input = setPortionsSchema.parse({
          mealId: a.meal_id,
          foodId: a.food_id,
          grams: a.grams.map((g) => ({ memberId: g.member_id, grams: Math.max(0, g.grams) })),
        });
        return { ok: true, proposal: { type: "set_meal_portions", input } };
      }
      case "propose_rename_meal": {
        const a = z.object({ meal_id: z.string(), title: z.string() }).parse(args);
        return { ok: true, proposal: proposalSchema.parse({ type: "rename_meal", mealId: a.meal_id, title: a.title }) };
      }
      default:
        return { ok: false, message: `Unknown tool ${name}` };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return { ok: false, message: `Invalid arguments: ${issue.path.join(".") || "input"} — ${issue.message}` };
    }
    return { ok: false, message: "Invalid arguments" };
  }
}

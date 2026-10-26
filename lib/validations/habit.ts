import { z } from "zod";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const habitFrequencySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({
    kind: z.literal("days"),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pick at least one day")
      .max(7)
      .transform((days) => [...new Set(days)].sort()),
  }),
  z.object({ kind: z.literal("per_week"), times: z.number().int().min(1).max(7) }),
]);

export const habitGoalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("check") }),
  z.object({
    kind: z.literal("count"),
    target: z.number().positive("Target must be above zero").max(1_000_000),
    unit: z.string().trim().max(20).nullable().default(null),
  }),
]);

const habitFields = {
  title: z.string().trim().min(1, "Name is required").max(120),
  emoji: z.string().trim().max(8).nullable().optional(),
  /** null = for everyone */
  ownerMemberId: z.uuid().nullable().optional(),
  goal: habitGoalSchema,
  frequency: habitFrequencySchema,
  startDate: dateSchema.optional(),
};

export const createHabitSchema = z.object(habitFields);

export const updateHabitSchema = z
  .object({
    title: habitFields.title.optional(),
    emoji: habitFields.emoji,
    ownerMemberId: habitFields.ownerMemberId,
    goal: habitGoalSchema.optional(),
    frequency: habitFrequencySchema.optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "No changes provided",
  });

/** value 0 (or null) clears the day. */
export const habitCheckinSchema = z.object({
  date: dateSchema,
  value: z.number().min(0).max(1_000_000).nullable(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type HabitCheckinInput = z.infer<typeof habitCheckinSchema>;

import { z } from "zod";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: ГГГГ-ММ-ДД");

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Формат времени: ЧЧ:ММ");

/** Optional free text; the service stores "" as null. */
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const taskRepeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("daily"), interval: z.number().int().min(1).max(52).default(1) }),
  z.object({
    kind: z.literal("weekly"),
    interval: z.number().int().min(1).max(52).default(1),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Выбери хотя бы один день")
      .max(7)
      .transform((days) => [...new Set(days)].sort()),
  }),
  z.object({
    kind: z.literal("monthly"),
    interval: z.number().int().min(1).max(12).default(1),
    dayOfMonth: z.number().int().min(1).max(31),
  }),
]);

const taskFields = {
  title: z.string().trim().min(1, "Нужно название").max(200),
  notes: optionalText(2000),
  /** null = for both partners */
  assigneeMemberId: z.uuid().nullable().optional(),
  startDate: dateSchema.nullable().optional(),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  repeat: taskRepeatSchema.optional(),
  repeatUntil: dateSchema.nullable().optional(),
};

type TaskShape = {
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  repeat?: z.infer<typeof taskRepeatSchema>;
  repeatUntil?: string | null;
};

function checkConsistency(data: TaskShape, ctx: z.RefinementCtx) {
  const repeating = data.repeat && data.repeat.kind !== "none";
  if (repeating && !data.startDate) {
    ctx.addIssue({ code: "custom", path: ["startDate"], message: "Для повтора нужна дата начала" });
  }
  if (data.startTime && !data.startDate) {
    ctx.addIssue({ code: "custom", path: ["startDate"], message: "Для времени нужна дата" });
  }
  if (data.endTime && !data.startTime) {
    ctx.addIssue({ code: "custom", path: ["startTime"], message: "Сначала укажи время начала" });
  }
  if (data.endTime && data.startTime && data.endTime <= data.startTime) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "Конец должен быть позже начала" });
  }
  if (data.repeatUntil && data.startDate && data.repeatUntil < data.startDate) {
    ctx.addIssue({ code: "custom", path: ["repeatUntil"], message: "Не раньше даты начала" });
  }
}

export const createTaskSchema = z.object(taskFields).superRefine(checkConsistency);

export const updateTaskSchema = z
  .object({ ...taskFields, title: taskFields.title.optional(), isArchived: z.boolean().optional() })
  .superRefine(checkConsistency)
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Нет изменений",
  });

export const setTaskCompletionSchema = z.object({
  /** Occurrence date; omit for undated one-offs. */
  date: dateSchema.nullable().optional(),
  done: z.boolean(),
});

export const agendaQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((value) => value.to >= value.from, { message: "Конец периода не может быть раньше начала" })
  .refine(
    (value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 62,
    { message: "Период не может быть длиннее 62 дней" },
  );

export type TaskRepeatInput = z.infer<typeof taskRepeatSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type SetTaskCompletionInput = z.infer<typeof setTaskCompletionSchema>;

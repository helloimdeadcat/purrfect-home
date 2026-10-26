import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

/** Accept form strings and numeric DB/JSON values (PostgREST often returns numbers). */
const moneyPositiveSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const raw =
      typeof value === "number" ? value : value.trim();
    if (raw === "" || (typeof raw === "string" && raw.length === 0)) {
      ctx.addIssue({ code: "custom", message: "Amount is required" });
      return z.NEVER;
    }
    try {
      const normalized = normalizeMoneyInput(raw);
      if (normalized.startsWith("-") || normalized === "0.00") {
        ctx.addIssue({
          code: "custom",
          message: "Amount must be greater than zero",
        });
        return z.NEVER;
      }
      return normalized;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount with up to 2 decimals",
      });
      return z.NEVER;
    }
  });

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const optionalDateSchema = z
  .union([dateSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return value;
  });

export const recurringFrequencySchema = z.enum([
  "weekly",
  "monthly",
  "yearly",
  "custom",
  "daily",
]);

export const createRecurringSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    type: z.enum(["expense", "income"]),
    amount: moneyPositiveSchema,
    currency: z.string().trim().length(3).toUpperCase().optional(),
    categoryId: z.uuid(),
    accountId: z.uuid(),
    frequency: recurringFrequencySchema,
    intervalDays: z.number().int().positive().nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    startDate: dateSchema,
    endDate: optionalDateSchema,
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    /** Mandatory outflows reduce Safe-to-Spend (default true). */
    isMandatory: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "custom" && (!data.intervalDays || data.intervalDays < 1)) {
      ctx.addIssue({
        code: "custom",
        path: ["intervalDays"],
        message: "Interval in days is required for custom frequency",
      });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }
  });

export const updateRecurringSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: z.enum(["expense", "income"]).optional(),
    amount: moneyPositiveSchema.optional(),
    categoryId: z.uuid().optional(),
    accountId: z.uuid().optional(),
    frequency: recurringFrequencySchema.optional(),
    intervalDays: z.number().int().positive().nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    endDate: optionalDateSchema,
    description: z.string().trim().max(500).nullable().optional(),
    isMandatory: z.boolean().optional(),
    isActive: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "No changes provided" },
  );

const optionalNotesSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

export const confirmOccurrenceSchema = z.object({
  // Amount may arrive as a JSON number when the UI seeds from PostgREST numerics.
  amount: moneyPositiveSchema.optional(),
  transactionDate: optionalDateSchema,
  notes: optionalNotesSchema,
});

export const skipOccurrenceSchema = z.object({
  notes: optionalNotesSchema,
});

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
/** Service-facing confirm payload; all fields optional before/without Zod parse. */
export type ConfirmOccurrenceInput = {
  amount?: string;
  transactionDate?: string | null;
  notes?: string | null;
};
/** Service-facing skip payload. */
export type SkipOccurrenceInput = {
  notes?: string | null;
};

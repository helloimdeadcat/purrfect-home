import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

const moneyPositiveSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      const normalized = normalizeMoneyInput(value);
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

const moneyNonNegativeSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      const normalized = normalizeMoneyInput(value);
      if (normalized.startsWith("-")) {
        ctx.addIssue({
          code: "custom",
          message: "Amount cannot be negative",
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

const currencySchema = z
  .string()
  .trim()
  .length(3, "Currency must be a 3-letter code")
  .toUpperCase();

const optionalDateSchema = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  targetAmount: moneyPositiveSchema,
  currency: currencySchema.optional(),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  targetDate: optionalDateSchema,
  initialAmount: moneyNonNegativeSchema.optional().default("0.00"),
});

export const updateGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    targetAmount: moneyPositiveSchema.optional(),
    description: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),
    // Keep undefined when omitted (do not coerce missing → null)
    targetDate: z
      .union([
        z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
        z.literal("").transform(() => null),
        z.null(),
      ])
      .optional(),
    isArchived: z.boolean().optional(),
    isCompleted: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.targetAmount !== undefined ||
      value.description !== undefined ||
      value.targetDate !== undefined ||
      value.isArchived !== undefined ||
      value.isCompleted !== undefined,
    { message: "No changes provided" },
  );

export const goalOperationSchema = z.object({
  type: z.enum(["deposit", "withdraw", "adjust"]),
  amount: moneyNonNegativeSchema,
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  operationDate: optionalDateSchema,
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type GoalOperationInput = z.infer<typeof goalOperationSchema>;

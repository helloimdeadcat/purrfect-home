import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      const normalized = normalizeMoneyInput(value);
      if (normalized.startsWith("-") || normalized === "0.00") {
        ctx.addIssue({
          code: "custom",
          message: "Budget limit must be greater than zero",
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

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

export const createBudgetSchema = z.object({
  categoryId: z.uuid("Select a category"),
  amount: moneyInputSchema,
  /** Target month for the monthly budget (YYYY-MM). Defaults to current UTC month. */
  month: yearMonthSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const updateBudgetSchema = z
  .object({
    amount: moneyInputSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    categoryId: z.uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.name !== undefined ||
      value.categoryId !== undefined ||
      value.isActive !== undefined,
    { message: "No changes provided" },
  );

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

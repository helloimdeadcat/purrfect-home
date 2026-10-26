import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

export const accountTypeSchema = z.enum([
  "bank_account",
  "credit_card",
  "cash",
  "savings",
  "investment",
  "other",
]);

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      return normalizeMoneyInput(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount with up to 2 decimals",
      });
      return z.NEVER;
    }
  });

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: accountTypeSchema,
  currency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .optional(),
  initialBalance: moneyInputSchema.optional().default("0.00"),
  isShared: z.boolean().optional().default(true),
  color: z.string().trim().max(32).nullable().optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: accountTypeSchema.optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  initialBalance: moneyInputSchema.optional(),
  isShared: z.boolean().optional(),
  isActive: z.boolean().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

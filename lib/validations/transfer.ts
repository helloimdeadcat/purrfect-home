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
        ctx.addIssue({ code: "custom", message: "Amount must be greater than 0" });
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

export const createTransferSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: moneyInputSchema,
    currency: z.string().trim().length(3).toUpperCase().optional(),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Choose two different accounts",
    path: ["toAccountId"],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

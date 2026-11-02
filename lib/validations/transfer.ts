import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Укажи сумму")
  .transform((value, ctx) => {
    try {
      const normalized = normalizeMoneyInput(value);
      if (normalized.startsWith("-") || normalized === "0.00") {
        ctx.addIssue({ code: "custom", message: "Сумма должна быть больше нуля" });
        return z.NEVER;
      }
      return normalized;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Введи корректную сумму (не больше 2 знаков после запятой)",
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
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: ГГГГ-ММ-ДД"),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Выбери два разных счёта",
    path: ["toAccountId"],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

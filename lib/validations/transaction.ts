import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

export const transactionTypeSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "adjustment",
]);

export const adjustmentDirectionSchema = z.enum(["increase", "decrease"]);

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

const transactionFields = {
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  ownerMemberId: z.string().uuid().nullable().optional(),
  type: z.enum(["expense", "income", "adjustment"]),
  amount: moneyInputSchema,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: ГГГГ-ММ-ДД"),
  description: z.string().trim().max(500).nullable().optional(),
  merchant: z.string().trim().max(200).nullable().optional(),
  isNecessary: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
  adjustmentDirection: adjustmentDirectionSchema.nullable().optional(),
  tagIds: z.array(z.uuid()).max(20).optional(),
  incomeSourceId: z.uuid().nullable().optional(),
};

function refineAdjustmentDirection(
  data: {
    type?: "expense" | "income" | "adjustment";
    adjustmentDirection?: "increase" | "decrease" | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.type === "adjustment" && !data.adjustmentDirection) {
    ctx.addIssue({
      code: "custom",
      path: ["adjustmentDirection"],
      message: "Для корректировки выбери направление",
    });
  }
  if (data.type && data.type !== "adjustment" && data.adjustmentDirection) {
    ctx.addIssue({
      code: "custom",
      path: ["adjustmentDirection"],
      message: "Направление можно указать только для корректировки",
    });
  }
}

export const createTransactionSchema = z
  .object(transactionFields)
  .superRefine(refineAdjustmentDirection);

export const updateTransactionSchema = z
  .object({
    accountId: transactionFields.accountId.optional(),
    categoryId: transactionFields.categoryId,
    ownerMemberId: transactionFields.ownerMemberId,
    type: transactionFields.type.optional(),
    amount: moneyInputSchema.optional(),
    currency: transactionFields.currency,
    transactionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: ГГГГ-ММ-ДД")
      .optional(),
    description: transactionFields.description,
    merchant: transactionFields.merchant,
    isNecessary: z.boolean().optional(),
    notes: transactionFields.notes,
    adjustmentDirection: adjustmentDirectionSchema.nullable().optional(),
    tagIds: transactionFields.tagIds,
    incomeSourceId: transactionFields.incomeSourceId,
  })
  .superRefine(refineAdjustmentDirection);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

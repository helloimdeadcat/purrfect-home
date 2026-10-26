import { z } from "zod";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Longest export window — keeps a single request bounded. */
export const MAX_EXPORT_DAYS = 5 * 366;

function spanDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

export const transactionExportSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    currency: z.string().trim().length(3).toUpperCase().optional(),
    accountId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({ code: "custom", message: "End date must be on or after start date", path: ["to"] });
    } else if (spanDays(data.from, data.to) > MAX_EXPORT_DAYS) {
      ctx.addIssue({ code: "custom", message: "Export range cannot exceed 5 years", path: ["to"] });
    }
  });

export type TransactionExportInput = z.infer<typeof transactionExportSchema>;

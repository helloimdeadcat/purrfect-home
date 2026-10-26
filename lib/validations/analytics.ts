import { z } from "zod";

export const analyticsPeriodPresetSchema = z.enum([
  "current_month",
  "previous_month",
  "last_3_months",
  "last_6_months",
  "year",
  "custom",
]);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const analyticsQuerySchema = z
  .object({
    period: analyticsPeriodPresetSchema.default("current_month"),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    accountId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.period === "custom") {
      if (!data.from || !data.to) {
        ctx.addIssue({
          code: "custom",
          message: "Custom period requires from and to",
          path: ["from"],
        });
      }
    }
  });

export type AnalyticsQueryInput = {
  period:
    | "current_month"
    | "previous_month"
    | "last_3_months"
    | "last_6_months"
    | "year"
    | "custom";
  currency?: string;
  from?: string;
  to?: string;
  accountId?: string;
};

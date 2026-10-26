import { z } from "zod";

export const forecastHorizonPresetSchema = z.enum([
  "end_of_month",
  "next_7_days",
  "next_30_days",
  "custom",
]);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const forecastQuerySchema = z
  .object({
    horizon: forecastHorizonPresetSchema.default("end_of_month"),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.horizon === "custom") {
      if (!data.to) {
        ctx.addIssue({
          code: "custom",
          message: "Custom horizon requires to",
          path: ["to"],
        });
      }
    }
  });

export type ForecastQueryInput = {
  horizon: "end_of_month" | "next_7_days" | "next_30_days" | "custom";
  currency?: string;
  from?: string;
  to?: string;
};

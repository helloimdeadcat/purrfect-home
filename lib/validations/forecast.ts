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
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: ГГГГ-ММ-ДД");

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
          message: "Для своего горизонта укажи конечную дату",
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

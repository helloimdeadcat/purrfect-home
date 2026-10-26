import { z } from "zod";

import { normalizeMoneyInput } from "@/lib/calculations/money";

const moneyNonNegativeSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      const normalized = normalizeMoneyInput(value);
      if (normalized.startsWith("-")) {
        ctx.addIssue({ code: "custom", message: "Amount cannot be negative" });
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

const optionalColorSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null || value === "") return null;
    return value;
  });

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  lastName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  displayName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  /** Personal preference only — does not convert household money. */
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

/** Per-currency Safe-to-Spend reserve; zero entries are dropped. */
const reserveMapSchema = z
  .record(
    z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code").toUpperCase(),
    moneyNonNegativeSchema,
  )
  .refine((value) => Object.keys(value).length <= 20, "Too many currencies")
  .transform((value) =>
    Object.fromEntries(Object.entries(value).filter(([, amount]) => amount !== "0.00")),
  );

export const updateHouseholdSettingsSchema = z
  .object({
    timezone: z.string().trim().min(1).max(64).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    monthStartsOn: z.number().int().min(1).max(28).optional(),
    defaultAccountId: z.uuid().nullable().optional(),
    defaultCategoryId: z.uuid().nullable().optional(),
    safeToSpendReserves: reserveMapSchema.optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "No changes provided" },
  );

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(["expense", "income", "both"]),
  color: optionalColorSchema,
  icon: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null)),
  parentId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: z.enum(["expense", "income", "both"]).optional(),
    color: optionalColorSchema,
    icon: z.string().trim().max(40).nullable().optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "No changes provided" },
  );

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  color: optionalColorSchema,
});

export const updateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: optionalColorSchema,
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "No changes provided" },
  );

export const createIncomeSourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  amount: moneyNonNegativeSchema,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  accountId: z.uuid(),
  memberId: z.uuid().optional(),
});

export const updateIncomeSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: moneyNonNegativeSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    frequency: z
      .enum(["daily", "weekly", "monthly", "yearly", "custom"])
      .optional(),
    nextDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    accountId: z.uuid().optional(),
    memberId: z.uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "No changes provided" },
  );

export type UpdateProfileInput = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  currency?: string;
};
export type UpdateHouseholdSettingsInput = {
  timezone?: string;
  weekStartsOn?: number;
  monthStartsOn?: number;
  defaultAccountId?: string | null;
  defaultCategoryId?: string | null;
  safeToSpendReserves?: Record<string, string>;
};
export type CreateCategoryInput = {
  name: string;
  type: "expense" | "income" | "both";
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};
export type UpdateCategoryInput = {
  name?: string;
  type?: "expense" | "income" | "both";
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};
export type CreateTagInput = {
  name: string;
  color?: string | null;
};
export type UpdateTagInput = {
  name?: string;
  color?: string | null;
  isActive?: boolean;
};
export type CreateIncomeSourceInput = {
  name: string;
  amount: string;
  currency?: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  nextDate: string;
  accountId: string;
  memberId?: string;
};
export type UpdateIncomeSourceInput = {
  name?: string;
  amount?: string;
  currency?: string;
  frequency?: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  nextDate?: string;
  accountId?: string;
  memberId?: string;
  isActive?: boolean;
};

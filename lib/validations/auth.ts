import { z } from "zod";

const inviteTokenField = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value && value.length >= 20 ? value : undefined,
  );

export const registerSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(80, "First name is too long"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(80, "Last name is too long"),
  householdName: z
    .string()
    .trim()
    .min(1, "Household name is required")
    .max(120, "Household name is too long")
    .default("Our Family"),
  currency: z
    .string()
    .trim()
    .length(3, "Currency must be a 3-letter code")
    .toUpperCase()
    .default("EUR"),
  inviteToken: inviteTokenField,
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  inviteToken: inviteTokenField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

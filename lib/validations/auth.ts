import { z } from "zod";

const inviteTokenField = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value && value.length >= 20 ? value : undefined,
  );

export const registerSchema = z.object({
  email: z.email("Введи корректную почту"),
  password: z
    .string()
    .min(8, "Пароль должен быть не короче 8 символов")
    .max(72, "Пароль слишком длинный"),
  firstName: z
    .string()
    .trim()
    .min(1, "Укажи имя")
    .max(80, "Имя слишком длинное"),
  lastName: z
    .string()
    .trim()
    .min(1, "Укажи фамилию")
    .max(80, "Фамилия слишком длинная"),
  householdName: z
    .string()
    .trim()
    .min(1, "Укажи название семьи")
    .max(120, "Название семьи слишком длинное")
    .default("Наша семья"),
  currency: z
    .string()
    .trim()
    .length(3, "Валюта — это код из 3 букв")
    .toUpperCase()
    .default("EUR"),
  inviteToken: inviteTokenField,
});

export const loginSchema = z.object({
  email: z.email("Введи корректную почту"),
  password: z.string().min(1, "Введи пароль"),
  inviteToken: inviteTokenField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

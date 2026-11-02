import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { AuthServiceError } from "@/services/auth-service";

export function jsonError(
  status: number,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: message,
      details: details ?? null,
    },
    { status },
  );
}

export function fromZodError(error: ZodError) {
  return jsonError(400, "Проверь введённые данные", error.flatten());
}

/** Supabase Auth replies in English; show the common cases in Russian. */
const AUTH_MESSAGES: [match: string, text: string][] = [
  ["invalid login credentials", "Неверная почта или пароль"],
  ["email not confirmed", "Почта ещё не подтверждена — проверь письмо"],
  ["user already registered", "Эта почта уже зарегистрирована — попробуй войти"],
  ["password should be at least", "Пароль слишком короткий"],
  ["rate limit", "Слишком много попыток — подожди немного и попробуй снова"],
  ["invalid email", "Введи корректную почту"],
  ["signups not allowed", "Регистрация сейчас закрыта"],
];

export function translateAuthMessage(message: string): string {
  const lower = message.toLowerCase();
  return AUTH_MESSAGES.find(([match]) => lower.includes(match))?.[1] ?? message;
}

export function fromAuthServiceError(error: AuthServiceError) {
  const status =
    error.code === "VALIDATION" ? 400 : error.code === "AUTH" ? 401 : 500;
  return jsonError(status, error.message, { code: error.code });
}

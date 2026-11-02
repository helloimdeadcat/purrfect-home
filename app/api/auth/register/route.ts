import { ZodError } from "zod";

import {
  fromAuthServiceError,
  fromZodError,
  jsonError,
  translateAuthMessage,
} from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validations/auth";
import { ensureUserBootstrap } from "@/services/auth-service";

/**
 * Public registration via Supabase Auth signUp.
 * Does NOT use the service-role Admin API (no auto-confirm bypass).
 * Household bootstrap runs only when a session exists (email already confirmed
 * or confirmation disabled in the Supabase project).
 *
 * Note: durable request rate limiting is not implemented here (needs Redis/edge
 * or Supabase Auth rate limits). Do not rely on in-memory limits.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = registerSchema.parse(body);

    const supabase = await createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          household_name: input.householdName,
          currency: input.currency,
        },
      },
    });

    if (signUpError) {
      return jsonError(400, translateAuthMessage(signUpError.message), { code: "AUTH" });
    }

    if (!signUpData.user) {
      return jsonError(500, "Регистрация прошла, но аккаунт не вернулся — попробуй войти");
    }

    // Email confirmation required — no session until the user confirms
    if (!signUpData.session) {
      return Response.json({
        ok: true,
        needsEmailConfirmation: true,
        userId: signUpData.user.id,
        message:
          "Проверь почту и подтверди аккаунт, а потом войди, чтобы закончить настройку.",
      });
    }

    // When joining via invite, still bootstrap a first household (multi-household
    // model). After explicit accept, active-household cookie switches context.
    const { data: bootstrap, error: bootstrapError } = await ensureUserBootstrap(
      signUpData.user,
      {
        firstName: input.firstName,
        lastName: input.lastName,
        householdName: input.householdName,
        currency: input.currency,
      },
    );

    if (bootstrapError) {
      return fromAuthServiceError(bootstrapError);
    }

    const redirectTo = input.inviteToken
      ? `/invite?token=${encodeURIComponent(input.inviteToken)}`
      : "/app/dashboard";

    return Response.json({
      ok: true,
      needsEmailConfirmation: false,
      userId: signUpData.user.id,
      householdId: bootstrap?.householdId ?? null,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fromZodError(error);
    }
    return jsonError(
      500,
      error instanceof Error ? error.message : "Не получилось зарегистрироваться",
    );
  }
}

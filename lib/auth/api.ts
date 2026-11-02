import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { fromZodError, jsonError } from "@/lib/auth/errors";
import { getHouseholdContext, type HouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { schedulePushDispatchAfterMutation } from "@/lib/push/dispatch";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type AuthedHousehold = {
  supabase: AppSupabase;
  ctx: HouseholdContext;
};

export async function requireHousehold(): Promise<
  | { ok: true; value: AuthedHousehold }
  | { ok: false; response: NextResponse }
> {
  const { supabase, user } = await getSessionUser();

  if (!user) {
    return { ok: false, response: jsonError(401, "Нужно войти в аккаунт") };
  }

  const { data: ctx, error } = await getHouseholdContext(supabase, user);
  if (!ctx) {
    return {
      ok: false,
      response: jsonError(403, error ?? "Нет доступа к семье"),
    };
  }

  // Mutating requests: push the notifications their triggers created.
  await schedulePushDispatchAfterMutation(ctx.householdId);

  return { ok: true, value: { supabase, ctx } };
}

export function fromServiceError(error: {
  code: string;
  message: string;
}) {
  const status =
    error.code === "FORBIDDEN"
      ? 403
      : error.code === "NOT_FOUND"
        ? 404
        : error.code === "VALIDATION"
          ? 400
          : error.code === "CONFLICT"
            ? 409
            : 500;
  return jsonError(status, error.message, { code: error.code });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return fromZodError(error);
  }
  // Unexpected exceptions can carry stack-ish internals (env, SQL, paths):
  // log them server-side, return a generic message.
  console.error("[api] unhandled route error", error);
  return jsonError(500, "Неожиданная ошибка сервера");
}

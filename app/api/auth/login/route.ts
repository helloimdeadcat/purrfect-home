import { ZodError } from "zod";

import { fromAuthServiceError, fromZodError, jsonError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ensureUserBootstrap } from "@/services/auth-service";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = loginSchema.parse(body);

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      return jsonError(401, error.message, { code: "AUTH" });
    }

    if (!data.user || !data.session) {
      return jsonError(401, "Invalid login response from auth provider");
    }

    const { data: bootstrap, error: bootstrapError } = await ensureUserBootstrap(
      data.user,
    );

    if (bootstrapError) {
      return fromAuthServiceError(bootstrapError);
    }

    const redirectTo = input.inviteToken
      ? `/invite?token=${encodeURIComponent(input.inviteToken)}`
      : "/app/dashboard";

    return Response.json({
      ok: true,
      userId: data.user.id,
      householdId: bootstrap?.householdId ?? null,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fromZodError(error);
    }
    return jsonError(
      500,
      error instanceof Error ? error.message : "Login failed",
    );
  }
}

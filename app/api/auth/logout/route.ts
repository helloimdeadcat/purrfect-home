import { jsonError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return jsonError(500, error.message, { code: "AUTH" });
    }

    return Response.json({ ok: true, redirectTo: "/login" });
  } catch (error) {
    return jsonError(
      500,
      error instanceof Error ? error.message : "Logout failed",
    );
  }
}

import { handleRouteError } from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { getSessionUser } from "@/lib/auth/session";
import { isPushConfigured } from "@/lib/push/config";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validations/push";

/** Save this device's push subscription for the signed-in user. */
export async function POST(request: Request) {
  try {
    if (!isPushConfigured()) {
      return jsonError(503, "Уведомления на телефон не настроены на сервере");
    }
    const { supabase, user } = await getSessionUser();
    if (!user) return jsonError(401, "Нужно войти в аккаунт");

    const input = pushSubscribeSchema.parse(await request.json());
    const { error } = await supabase.rpc("save_push_subscription", {
      p_endpoint: input.endpoint,
      p_p256dh: input.keys.p256dh,
      p_auth: input.keys.auth,
      p_user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
    });
    if (error) {
      console.error("[push] save subscription failed:", error.message);
      return jsonError(500, "Не получилось включить уведомления");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Forget this device's subscription (RLS: only the user's own rows). */
export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) return jsonError(401, "Нужно войти в аккаунт");

    const input = pushUnsubscribeSchema.parse(await request.json());
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", input.endpoint);
    if (error) {
      console.error("[push] delete subscription failed:", error.message);
      return jsonError(500, "Не получилось выключить уведомления");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

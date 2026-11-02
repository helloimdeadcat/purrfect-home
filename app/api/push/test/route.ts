import { handleRouteError } from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { getSessionUser } from "@/lib/auth/session";
import { isPushConfigured } from "@/lib/push/config";
import { sendPushToUsers } from "@/services/push-service";

const TEST_COOLDOWN_MS = 60_000;
/** Per instance; good enough to stop button mashing. */
const lastTestAt = new Map<string, number>();

/** Send a test push to all of the caller's devices (once a minute). */
export async function POST() {
  try {
    if (!isPushConfigured()) {
      return jsonError(503, "Уведомления на телефон не настроены на сервере");
    }
    const { user } = await getSessionUser();
    if (!user) return jsonError(401, "Нужно войти в аккаунт");

    const now = Date.now();
    const previous = lastTestAt.get(user.id);
    if (previous && now - previous < TEST_COOLDOWN_MS) {
      const seconds = Math.ceil((TEST_COOLDOWN_MS - (now - previous)) / 1000);
      return jsonError(429, `Проверять можно раз в минуту — подожди ещё ${seconds} с`);
    }
    lastTestAt.set(user.id, now);
    if (lastTestAt.size > 1000) {
      for (const [id, at] of lastTestAt) {
        if (now - at >= TEST_COOLDOWN_MS) lastTestAt.delete(id);
      }
    }

    const result = await sendPushToUsers([user.id], {
      title: "Purrfect Home",
      body: "Мяу! Уведомления на телефоне работают.",
      url: "/app/settings",
      tag: "push-test",
    });
    if (result.sent === 0) {
      return jsonError(
        404,
        "Не нашлось ни одного подключённого устройства — включи уведомления ещё раз",
      );
    }
    return Response.json({ ok: true, sent: result.sent });
  } catch (error) {
    return handleRouteError(error);
  }
}

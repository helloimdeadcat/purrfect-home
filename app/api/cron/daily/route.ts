import { timingSafeEqual } from "node:crypto";

import { isPushConfigured } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyCleanup } from "@/services/maintenance-service";
import {
  dispatchAllPendingNotificationPushes,
  sendPushToUsers,
} from "@/services/push-service";
import { buildMorningDigests } from "@/services/summary-service";

/**
 * Daily Vercel cron (vercel.json): retention cleanup, morning digest push,
 * and a flush of any in-app notifications that still need Web Push.
 * Running every day also keeps the free Supabase project from pausing after
 * 7 idle days. Vercel calls it with `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET the route stays closed.
 */
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cleanup = await runDailyCleanup(admin);

  const digest = { built: 0, sent: 0, removed: 0, error: false };
  const pendingPush = { households: 0, notifications: 0, error: false };
  if (isPushConfigured()) {
    try {
      const digests = await buildMorningDigests(admin);
      digest.built = digests.length;
      for (const d of digests) {
        const result = await sendPushToUsers([d.userId], {
          title: d.title,
          body: d.body,
          url: d.url,
          tag: "morning-digest",
        });
        digest.sent += result.sent;
        digest.removed += result.removed;
      }
    } catch (error) {
      console.error("cron/daily: morning digest failed", error);
      digest.error = true;
    }

    try {
      const flushed = await dispatchAllPendingNotificationPushes();
      pendingPush.households = flushed.households;
      pendingPush.notifications = flushed.notifications;
    } catch (error) {
      console.error("cron/daily: pending push flush failed", error);
      pendingPush.error = true;
    }
  }

  const failed =
    (cleanup.errors ?? 0) > 0 || digest.error || pendingPush.error;
  return Response.json(
    { cleanup, digest, pendingPush },
    { status: failed ? 500 : 200 },
  );
}

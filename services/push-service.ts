import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { getVapidConfig, type VapidConfig } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Web Push delivery. SERVER ONLY — uses the service-role client.
 *
 * Every function is a silent no-op when VAPID_* env vars are missing, so the
 * app works unchanged without push configured.
 */

type AdminClient = SupabaseClient<Database>;

export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path opened on tap; defaults to /app/notifications. */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

type Message = { userId: string; payload: PushPayload };

type SubscriptionRow = Pick<
  Database["public"]["Tables"]["push_subscriptions"]["Row"],
  "id" | "user_id" | "endpoint" | "p256dh" | "auth"
>;

export const DEFAULT_PUSH_URL = "/app/notifications";
/** Max notifications pushed per dispatcher call. */
export const DISPATCH_BATCH_LIMIT = 20;
/**
 * Notifications older than this are marked pushed but not sent (too stale
 * to buzz a phone). Keep this long enough that invite-accept and other
 * off-requireHousehold writes still get a chance to flush via cron.
 */
export const DISPATCH_MAX_AGE = "48 hours";
/** Push services drop undelivered messages after this many seconds. */
const PUSH_TTL_SECONDS = 6 * 60 * 60;

/** Only same-origin absolute paths; anything else falls back to the inbox. */
export function safePushUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return DEFAULT_PUSH_URL;
  }
  return url.slice(0, 500);
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function serialize(payload: PushPayload): string {
  return JSON.stringify({
    title: clip(payload.title, 120) || "Purrfect Home",
    body: clip(payload.body, 400),
    url: safePushUrl(payload.url),
    tag: payload.tag ? clip(payload.tag, 64) : undefined,
  });
}

function getAdmin(): AdminClient | null {
  try {
    return createAdminClient();
  } catch (error) {
    console.warn(
      "[push] admin client unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

/** Sends every message to all devices of its user, then prunes dead endpoints. */
async function deliver(
  admin: AdminClient,
  config: VapidConfig,
  messages: Message[],
): Promise<{ sent: number; removed: number }> {
  const userIds = [...new Set(messages.map((message) => message.userId))];
  if (userIds.length === 0) return { sent: 0, removed: 0 };

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    console.warn("[push] could not load subscriptions:", error.message);
    return { sent: 0, removed: 0 };
  }

  const byUser = new Map<string, SubscriptionRow[]>();
  for (const row of (data ?? []) as SubscriptionRow[]) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const gone = new Set<string>();
  const used = new Set<string>();
  let sent = 0;

  const jobs = messages.flatMap((message) =>
    (byUser.get(message.userId) ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          serialize(message.payload),
          {
            vapidDetails: config,
            TTL: PUSH_TTL_SECONDS,
            urgency: "normal",
            timeout: 10_000,
          },
        );
        sent += 1;
        used.add(sub.id);
      } catch (sendError) {
        const status = statusOf(sendError);
        if (status === 404 || status === 410) {
          // Subscription expired or was revoked in the browser.
          gone.add(sub.id);
        } else {
          console.warn("[push] send failed", { status, subscription: sub.id });
        }
      }
    }),
  );
  await Promise.all(jobs);

  for (const id of gone) used.delete(id);

  if (gone.size > 0) {
    const { error: deleteError } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", [...gone]);
    if (deleteError) console.warn("[push] prune failed:", deleteError.message);
  }
  if (used.size > 0) {
    const { error: touchError } = await admin
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", [...used]);
    if (touchError) console.warn("[push] last_used_at update failed:", touchError.message);
  }

  return { sent, removed: gone.size };
}

/**
 * Push one message to every subscribed device of the given users.
 * Expired endpoints (404/410) are deleted. Never throws.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const config = getVapidConfig();
  if (!config || userIds.length === 0) return { sent: 0, removed: 0 };

  const admin = getAdmin();
  if (!admin) return { sent: 0, removed: 0 };

  try {
    return await deliver(
      admin,
      config,
      [...new Set(userIds)].map((userId) => ({ userId, payload })),
    );
  } catch (error) {
    console.warn("[push] sendPushToUsers failed:", error instanceof Error ? error.message : error);
    return { sent: 0, removed: 0 };
  }
}

/**
 * Push the household's fresh in-app notifications to their recipients.
 *
 * claim_notification_pushes() marks a batch pushed and returns it in one
 * statement (FOR UPDATE SKIP LOCKED), so concurrent dispatchers never send
 * the same notification twice; stale rows (> DISPATCH_MAX_AGE) are marked
 * without being sent. Returns how many notifications were claimed for
 * sending. Never throws.
 */
export async function dispatchPendingNotificationPushes(
  householdId: string,
): Promise<number> {
  const config = getVapidConfig();
  if (!config || !householdId) return 0;

  const admin = getAdmin();
  if (!admin) return 0;

  try {
    const { data, error } = await admin.rpc("claim_notification_pushes", {
      p_household_id: householdId,
      p_limit: DISPATCH_BATCH_LIMIT,
      p_max_age: DISPATCH_MAX_AGE,
    });
    if (error) {
      // Typically: migration 20261027120000 not applied yet.
      console.warn("[push] claim failed:", error.message);
      return 0;
    }

    const rows = data ?? [];
    if (rows.length === 0) return 0;

    await deliver(
      admin,
      config,
      rows.map((row) => ({
        userId: row.user_id,
        payload: {
          title: row.title,
          body: row.message,
          url: row.link ?? DEFAULT_PUSH_URL,
          tag: `notification-${row.id}`,
        },
      })),
    );
    return rows.length;
  } catch (error) {
    console.warn("[push] dispatch failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Flush unpushed notifications for every household that still has any.
 * Used by the daily cron so invite-accept (and similar) pushes are not lost
 * if nobody hits a mutating requireHousehold() route soon after.
 * Caps households per run to keep cron under maxDuration. Never throws.
 */
export async function dispatchAllPendingNotificationPushes(
  options?: { householdLimit?: number },
): Promise<{ households: number; notifications: number }> {
  const config = getVapidConfig();
  if (!config) return { households: 0, notifications: 0 };

  const admin = getAdmin();
  if (!admin) return { households: 0, notifications: 0 };

  const householdLimit = Math.min(
    Math.max(options?.householdLimit ?? 50, 1),
    200,
  );

  try {
    const { data, error } = await admin
      .from("notifications")
      .select("household_id")
      .is("pushed_at", null)
      .limit(1000);
    if (error || !data) {
      console.warn("[push] list pending households failed:", error?.message);
      return { households: 0, notifications: 0 };
    }

    const householdIds = [
      ...new Set(data.map((row) => row.household_id).filter(Boolean)),
    ].slice(0, householdLimit);

    let notifications = 0;
    for (const householdId of householdIds) {
      notifications += await dispatchPendingNotificationPushes(householdId);
    }
    return { households: householdIds.length, notifications };
  } catch (error) {
    console.warn(
      "[push] dispatchAll failed:",
      error instanceof Error ? error.message : error,
    );
    return { households: 0, notifications: 0 };
  }
}

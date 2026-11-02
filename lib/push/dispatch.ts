import { headers } from "next/headers";
import { after } from "next/server";

import { isPushConfigured, REQUEST_METHOD_HEADER } from "@/lib/push/config";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Schedule a push flush for a household after the current response.
 * Used when notifications may have been inserted without going through
 * requireHousehold() (e.g. accepting an invitation). Never throws.
 */
export async function schedulePushDispatch(householdId: string): Promise<void> {
  if (!isPushConfigured() || !householdId) return;
  try {
    after(async () => {
      const { dispatchPendingNotificationPushes } = await import(
        "@/services/push-service"
      );
      await dispatchPendingNotificationPushes(householdId);
    });
  } catch {
    // Not inside a request (unit tests, build) — nothing to schedule.
  }
}

/**
 * Central push hook, called by requireHousehold() for every API request.
 *
 * Notifications are inserted by DB triggers during API writes, so after any
 * mutating request (POST/PATCH/PUT/DELETE) we push the household's pending
 * notifications with `after()` — the response is not delayed. Route handlers
 * get no Request here, so proxy.ts forwards the method in a request header.
 *
 * No-op when VAPID is not configured, for read-only requests, or outside a
 * request scope (tests, scripts). Never throws.
 */
export async function schedulePushDispatchAfterMutation(
  householdId: string,
): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const method = (await headers()).get(REQUEST_METHOD_HEADER)?.toUpperCase();
    if (!method || READ_ONLY_METHODS.has(method)) return;

    await schedulePushDispatch(householdId);
  } catch {
    // Not inside a request (unit tests, build) — nothing to schedule.
  }
}

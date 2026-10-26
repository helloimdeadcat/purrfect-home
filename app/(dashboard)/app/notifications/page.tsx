import Link from "next/link";
import { redirect } from "next/navigation";

import { MarkReadButton } from "@/components/notifications/mark-read-button";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listNotifications } from "@/services/notification-service";
import { EmptyState } from "@/components/cute/empty-state";
import { Heart } from "@/components/cute/illustrations";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function NotificationsPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { data, error } = await listNotifications(supabase, ctx);
  const notifications = data ?? [];
  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Updates from your household — confirmed or skipped payments and
            membership changes.
          </p>
        </div>
        {hasUnread ? <MarkReadButton label="Mark all as read" /> : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      {notifications.length === 0 && !error ? (
        <EmptyState title="No notifications yet">You will see updates here when your partner confirms payments or joins the household.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`card-soft grid gap-1 px-4 py-3 ${
                notification.is_read ? "" : "border-primary/40 bg-secondary/50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {notification.is_read ? null : (
                    <>
                      <span className="sr-only">Unread: </span>
                      <Heart className="mr-1.5 inline size-3.5 -translate-y-px text-primary" />
                    </>
                  )}
                  {notification.title}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatWhen(notification.created_at)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{notification.message}</p>
              <div className="flex items-center gap-3 text-sm">
                {notification.link?.startsWith("/app/") ? (
                  <Link
                    href={notification.link}
                    className="underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                ) : null}
                {notification.is_read ? null : (
                  <MarkReadButton ids={[notification.id]} label="Mark as read" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

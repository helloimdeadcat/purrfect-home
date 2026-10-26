import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/forms/logout-button";
import { CatFace, Heart } from "@/components/cute/illustrations";
import { AppNav } from "@/components/nav/app-nav";
import { canAdmin, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/services/notification-service";

const navItems = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/tasks", label: "To-do" },
  { href: "/app/schedule", label: "Schedule" },
  { href: "/app/habits", label: "Habits" },
  { href: "/app/meals", label: "Meals" },
  { href: "/app/assistant", label: "Assistant ✨" },
  { href: "/app/transactions", label: "Transactions" },
  { href: "/app/accounts", label: "Accounts" },
  { href: "/app/family", label: "Family" },
  { href: "/app/budgets", label: "Budgets" },
  { href: "/app/goals", label: "Goals" },
  { href: "/app/recurring", label: "Recurring" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/settings", label: "Settings" },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ctx } = await getHouseholdContext(supabase, user);
  const unread = ctx ? ((await countUnreadNotifications(supabase, ctx)).data ?? 0) : 0;
  const items = [
    ...navItems,
    ...(ctx && canAdmin(ctx.role)
      ? [{ href: "/app/activity", label: "Activity" } as const]
      : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/app/dashboard"
              className="flex shrink-0 items-center gap-2 text-lg font-semibold"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <CatFace className="size-9" />
              <span className="hidden sm:inline">Purrfect Home</span>
            </Link>
            <AppNav items={items} variant="desktop" />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/app/notifications"
              className="relative grid size-9 place-items-center rounded-full text-primary transition-colors hover:bg-secondary"
              aria-label={
                unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
              }
              title="Notifications"
            >
              <Heart className="size-5" />
              {unread > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-primary-foreground tabular-nums ring-2 ring-background">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
        <AppNav items={items} variant="mobile" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

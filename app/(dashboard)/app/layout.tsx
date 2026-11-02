import { redirect } from "next/navigation";

import { AppShell, type NavGroup } from "@/components/nav/app-shell";
import { canAdmin, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/services/notification-service";

const navGroups: NavGroup[] = [
  {
    title: "Дом",
    items: [
      { href: "/app/dashboard", label: "Главная" },
      { href: "/app/tasks", label: "Дела" },
      { href: "/app/schedule", label: "Расписание" },
      { href: "/app/habits", label: "Привычки" },
      { href: "/app/meals", label: "Питание" },
      { href: "/app/shopping", label: "Покупки" },
      { href: "/app/assistant", label: "Морти ✨" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/app/transactions", label: "Операции" },
      { href: "/app/accounts", label: "Счета" },
      { href: "/app/budgets", label: "Бюджеты" },
      { href: "/app/goals", label: "Цели" },
      { href: "/app/recurring", label: "Регулярные платежи" },
      { href: "/app/calendar", label: "Календарь" },
      { href: "/app/analytics", label: "Аналитика" },
    ],
  },
  {
    title: "Семья",
    items: [
      { href: "/app/family", label: "Семья" },
      { href: "/app/settings", label: "Настройки" },
    ],
  },
];

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
  const unread = ctx
    ? ((await countUnreadNotifications(supabase, ctx)).data ?? 0)
    : 0;

  const groups: NavGroup[] =
    ctx && canAdmin(ctx.role)
      ? navGroups.map((group) =>
          group.title === "Семья"
            ? {
                ...group,
                items: [
                  ...group.items,
                  { href: "/app/activity", label: "История" },
                ],
              }
            : group,
        )
      : navGroups;

  return (
    <AppShell groups={groups} email={user.email} unread={unread}>
      {children}
    </AppShell>
  );
}

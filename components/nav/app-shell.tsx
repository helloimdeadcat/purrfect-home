"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { LogoutButton } from "@/components/forms/logout-button";
import { CatFace, Heart } from "@/components/cute/illustrations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NavGroup = {
  title: string;
  items: readonly { href: string; label: string }[];
};

type Props = {
  groups: readonly NavGroup[];
  email: string | null | undefined;
  unread: number;
  children: ReactNode;
};

function NavLinks({
  groups,
  onNavigate,
}: {
  groups: readonly NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Главное меню" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.title} className="grid gap-1">
          <p className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {group.title}
          </p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-secondary-foreground",
                      active &&
                        "bg-secondary font-semibold text-secondary-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Sticky top bar + desktop sidebar + mobile burger drawer.
 * Replaces the old horizontal scroll strip that was hard to use on phones.
 */
export function AppShell({ groups, email, unread, children }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const brand = (
    <Link
      href="/app/dashboard"
      className="flex items-center gap-2 text-lg font-semibold"
      style={{ fontFamily: "var(--font-heading)" }}
      onClick={() => setOpen(false)}
    >
      <CatFace className="size-9" />
      <span>Purrfect Home</span>
    </Link>
  );

  return (
    <div className="flex min-h-full flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background/90 backdrop-blur lg:flex">
        <div className="border-b border-border px-4 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks groups={groups} />
        </div>
        <div className="grid gap-2 border-t border-border p-4">
          <p className="truncate text-xs text-muted-foreground" title={email ?? undefined}>
            {email}
          </p>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-expanded={open}
                aria-controls="app-mobile-nav"
                aria-label={open ? "Закрыть меню" : "Открыть меню"}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
              <Link
                href="/app/dashboard"
                className="flex min-w-0 items-center gap-2 font-semibold lg:hidden"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <CatFace className="size-8 shrink-0" />
                <span className="truncate">Purrfect</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/app/notifications"
                className="relative grid size-9 place-items-center rounded-full text-primary transition-colors hover:bg-secondary"
                aria-label={
                  unread > 0
                    ? `Уведомления, непрочитанных: ${unread}`
                    : "Уведомления"
                }
                title="Уведомления"
              >
                <Heart className="size-5" />
                {unread > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-primary-foreground tabular-nums ring-2 ring-background">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
              <div className="hidden sm:block lg:hidden">
                <LogoutButton />
              </div>
            </div>
          </div>
        </header>

        {/* Mobile drawer */}
        <div
          className={cn(
            "fixed inset-0 z-40 lg:hidden",
            open ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <button
            type="button"
            aria-label="Закрыть меню"
            className={cn(
              "absolute inset-0 bg-foreground/30 transition-opacity",
              open ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setOpen(false)}
          />
          <aside
            id="app-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-background shadow-xl transition-transform duration-200 ease-out",
              open ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div id={titleId}>{brand}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть меню"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <div className="grid gap-2 border-t border-border p-4">
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <LogoutButton />
            </div>
          </aside>
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

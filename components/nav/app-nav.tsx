"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

/**
 * Desktop: inline links in the header. Mobile: a horizontally scrollable
 * strip under the header, so every section stays one tap away without a
 * menu toggle.
 */
export function AppNav({
  items,
  variant,
}: {
  items: readonly NavItem[];
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "text-sm text-muted-foreground",
        variant === "desktop"
          ? "hidden flex-wrap items-center gap-0.5 lg:flex"
          : "flex gap-1 overflow-x-auto px-2 pb-2 lg:hidden [scrollbar-width:none]",
      )}
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 transition-colors hover:bg-secondary hover:text-secondary-foreground",
              active && "bg-secondary font-semibold text-secondary-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

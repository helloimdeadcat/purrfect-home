import type { ReactNode } from "react";

import { SleepyCat } from "@/components/cute/illustrations";

/** Friendly empty state: a napping cat, a short message, optional action. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
      <SleepyCat className="w-32" />
      <p className="font-medium" style={{ fontFamily: "var(--font-heading)" }}>
        {title}
      </p>
      {children ? (
        <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      ) : null}
      {action}
    </div>
  );
}

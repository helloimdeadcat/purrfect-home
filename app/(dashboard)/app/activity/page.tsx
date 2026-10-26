import Link from "next/link";
import { redirect } from "next/navigation";

import { canAdmin, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { describeAuditAction, summarizeAuditChange } from "@/lib/audit/describe";
import { auditLogQuerySchema } from "@/lib/validations/notification";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/services/audit-service";
import { EmptyState } from "@/components/cute/empty-state";

type Props = {
  searchParams: Promise<{ before?: string }>;
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function ActivityPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  if (!canAdmin(ctx.role)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          Only household owners and admins can view the activity log.
        </p>
      </div>
    );
  }

  const parsed = auditLogQuerySchema.safeParse({ before: params.before });
  const { data, error } = await listAuditLog(
    supabase,
    ctx,
    parsed.success ? parsed.data : {},
  );
  const entries = data ?? [];
  const oldest = entries.at(-1)?.createdAt;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-muted-foreground">
          Important changes in {ctx.householdName}: membership, invitations,
          settings, accounts, deletions and recurring confirmations. Entries
          are recorded automatically and cannot be edited.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      {entries.length === 0 && !error ? (
        <EmptyState title="No activity yet" />
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => {
            const summary = summarizeAuditChange(entry.oldData, entry.newData);
            return (
              <li
                key={entry.id}
                className="grid gap-1 card-soft px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{describeAuditAction(entry.action)}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(entry.createdAt)} · {entry.actor}
                  </span>
                </div>
                {summary ? (
                  <p className="break-words text-sm text-muted-foreground">{summary}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {entries.length === AUDIT_PAGE_SIZE && oldest ? (
        <Link
          href={`/app/activity?before=${encodeURIComponent(oldest)}`}
          className="text-sm underline-offset-4 hover:underline"
        >
          Older entries
        </Link>
      ) : null}
    </div>
  );
}

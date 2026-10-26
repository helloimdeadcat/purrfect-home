"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EditRecurringForm } from "@/components/recurring/edit-recurring-form";
import { Button } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import type { CategoryOption } from "@/lib/data/categories";
import type {
  RecurringOccurrenceRow,
  RecurringPaymentView,
} from "@/services/recurring-service";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
};

type Props = {
  payment: RecurringPaymentView;
  accounts: AccountOption[];
  categories: CategoryOption[];
  canManage: boolean;
  canDelete: boolean;
};

export function RecurringPaymentCard({
  payment,
  accounts,
  categories,
  canManage,
  canDelete,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RecurringOccurrenceRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    async function load() {
      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/recurring/${payment.id}`);
        const data = (await response.json()) as {
          error?: string;
          occurrences?: RecurringOccurrenceRow[];
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "Failed to load history");
          return;
        }
        setHistory(data.occurrences ?? []);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, payment.id]);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/recurring/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete “${payment.name}” and its occurrence history?`)) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/recurring/${payment.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3 card-soft px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{payment.name}</p>
          <p className="text-sm text-muted-foreground capitalize">
            {payment.displayStatus} · {payment.type} · {payment.frequency}
            {payment.frequency === "custom" && payment.interval_days
              ? ` (${payment.interval_days}d)`
              : ""}
            {payment.type === "expense" && payment.is_mandatory === false
              ? " · optional"
              : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Next {payment.next_due_date}
            {payment.categoryName ? ` · ${payment.categoryName}` : ""}
            {payment.accountName ? ` · ${payment.accountName}` : ""}
          </p>
        </div>
        <p className="font-medium tabular-nums">
          {displayMoney(payment.amount, payment.currency)}
        </p>
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {!payment.is_archived ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Close edit" : "Edit"}
            </Button>
          ) : null}
          {payment.is_archived ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void patch({ isArchived: false, isActive: true })}
            >
              Restore
            </Button>
          ) : (
            <>
              {payment.is_active ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void patch({ isActive: false })}
                >
                  Pause
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void patch({ isActive: true })}
                >
                  Resume
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void patch({ isArchived: true, isActive: false })}
              >
                Archive
              </Button>
            </>
          )}
          {canDelete ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            {historyOpen ? "Hide history" : "History"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setHistoryOpen((value) => !value)}
        >
          {historyOpen ? "Hide history" : "History"}
        </Button>
      )}

      {editing && canManage ? (
        <EditRecurringForm
          payment={payment}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {historyOpen ? (
        <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
          {historyLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : null}
          {!historyLoading && history?.length === 0 ? (
            <p className="text-muted-foreground">No occurrences yet.</p>
          ) : null}
          {history?.map((occ) => (
            <div
              key={occ.id}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {occ.scheduled_date} · {occ.status}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {occ.amount
                  ? displayMoney(occ.amount, payment.currency)
                  : displayMoney(payment.amount, payment.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

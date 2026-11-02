"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EditRecurringForm } from "@/components/recurring/edit-recurring-form";
import { Button } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import { LOCALE } from "@/lib/locale";
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

const DISPLAY_STATUS_LABELS: Record<RecurringPaymentView["displayStatus"], string> = {
  active: "Активен",
  paused: "На паузе",
  archived: "В архиве",
  ended: "Завершён",
};

const TYPE_LABELS: Record<string, string> = {
  expense: "расход",
  income: "доход",
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "каждый день",
  weekly: "каждую неделю",
  monthly: "каждый месяц",
  yearly: "каждый год",
  custom: "свой интервал",
};

const OCCURRENCE_STATUS_LABELS: Record<string, string> = {
  pending: "ждёт подтверждения",
  paid: "оплачено",
  skipped: "пропущено",
  overdue: "просрочено",
};

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dayFormat.format(date);
}

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
          setError(data.error ?? "Не получилось загрузить историю");
          return;
        }
        setHistory(data.occurrences ?? []);
      } catch {
        if (!cancelled) setError("Ошибка сети");
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
        setError(data.error ?? "Не получилось обновить");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Удалить «${payment.name}» вместе с историей платежей?`)) {
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
        setError(data.error ?? "Не получилось удалить");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3 card-soft px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{payment.name}</p>
          <p className="text-sm text-muted-foreground">
            {DISPLAY_STATUS_LABELS[payment.displayStatus] ?? payment.displayStatus}{" "}
            · {TYPE_LABELS[payment.type] ?? payment.type} ·{" "}
            {FREQUENCY_LABELS[payment.frequency] ?? payment.frequency}
            {payment.frequency === "custom" && payment.interval_days
              ? ` (${payment.interval_days} дн.)`
              : ""}
            {payment.type === "expense" && payment.is_mandatory === false
              ? " · необязательный"
              : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Следующий: {formatDay(payment.next_due_date)}
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
              {editing ? "Закрыть" : "Изменить"}
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
              Восстановить
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
                  Пауза
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void patch({ isActive: true })}
                >
                  Продолжить
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void patch({ isArchived: true, isActive: false })}
              >
                В архив
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
              Удалить
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            {historyOpen ? "Скрыть историю" : "История"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setHistoryOpen((value) => !value)}
        >
          {historyOpen ? "Скрыть историю" : "История"}
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
            <p className="text-muted-foreground">Загружаем…</p>
          ) : null}
          {!historyLoading && history?.length === 0 ? (
            <p className="text-muted-foreground">Платежей пока не было.</p>
          ) : null}
          {history?.map((occ) => (
            <div
              key={occ.id}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {formatDay(occ.scheduled_date)} ·{" "}
                {OCCURRENCE_STATUS_LABELS[occ.status] ?? occ.status}
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

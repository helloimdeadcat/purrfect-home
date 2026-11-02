"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayMoney } from "@/lib/calculations/money";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "каждый день",
  weekly: "каждую неделю",
  monthly: "каждый месяц",
  yearly: "каждый год",
  custom: "свой график",
};

type AccountOption = { id: string; name: string; currency: string };
type Source = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  frequency: string;
  next_date: string;
  account_id: string;
  is_active: boolean;
};

type Props = {
  sources: Source[];
  accounts: AccountOption[];
  canManage: boolean;
  canArchive: boolean;
};

export function IncomeSourcesSettings({
  sources,
  accounts,
  canManage,
  canArchive,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [frequency, setFrequency] = useState("monthly");

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setError(null);
    setPending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const accountId = String(form.get("accountId") ?? "");
    const account = accounts.find((entry) => entry.id === accountId);
    try {
      const response = await fetch("/api/income-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          amount: String(form.get("amount") ?? ""),
          currency: account?.currency,
          frequency,
          nextDate: String(form.get("nextDate") ?? ""),
          accountId,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать источник дохода");
        return;
      }
      formEl.reset();
      setFrequency("monthly");
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  async function archive(id: string, name: string) {
    if (!canArchive) return;
    if (!window.confirm(`Отправить источник дохода «${name}» в архив?`)) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/income-sources/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось архивировать");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  async function restore(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/income-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось восстановить");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <section className="grid gap-3 card-soft p-4">
      <div>
        <h2 className="font-medium">Источники дохода</h2>
        <p className="text-sm text-muted-foreground">
          Ожидаемые поступления. Выбирай источник, когда добавляешь доход.
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Источников дохода пока нет.</p>
      ) : (
        <ul className="grid gap-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="font-medium">{source.name}</p>
                <p className="text-sm text-muted-foreground">
                  {displayMoney(source.amount, source.currency)} ·{" "}
                  {FREQUENCY_LABELS[source.frequency] ?? source.frequency} · следующий{" "}
                  {source.next_date}
                  {accountName.get(source.account_id)
                    ? ` · ${accountName.get(source.account_id)}`
                    : ""}
                  {source.is_active ? "" : " · в архиве"}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  {source.is_active ? (
                    canArchive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => void archive(source.id, source.name)}
                      >
                        В архив
                      </Button>
                    ) : null
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void restore(source.id)}
                    >
                      Восстановить
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && accounts.length > 0 ? (
        <form onSubmit={onCreate} className="grid gap-3 border-t border-border pt-3">
          <p className="text-sm font-medium">Новый источник дохода</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="is-name">Название</Label>
              <Input id="is-name" name="name" required maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="is-amount">Обычная сумма</Label>
              <Input
                id="is-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="is-account">Счёт</Label>
              <select
                id="is-account"
                name="accountId"
                required
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Выбери счёт
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="is-frequency">Как часто</Label>
              <select
                id="is-frequency"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
              >
                <option value="weekly">Каждую неделю</option>
                <option value="monthly">Каждый месяц</option>
                <option value="yearly">Каждый год</option>
                <option value="daily">Каждый день</option>
                <option value="custom">Свой график</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="is-next">Следующая дата</Label>
              <Input id="is-next" name="nextDate" type="date" required />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Сохраняем…" : "Добавить источник дохода"}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

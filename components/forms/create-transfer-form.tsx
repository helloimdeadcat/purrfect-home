"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountOption = { id: string; name: string; is_active: boolean };

type Props = {
  accounts: AccountOption[];
  /** Household-local today (YYYY-MM-DD) from the server — same on SSR and client. */
  defaultDate: string;
};

export function CreateTransferForm({ accounts, defaultDate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const activeAccounts = accounts.filter((account) => account.is_active);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      fromAccountId: String(form.get("fromAccountId") ?? ""),
      toAccountId: String(form.get("toAccountId") ?? ""),
      amount: String(form.get("amount") ?? ""),
      transferDate: String(form.get("transferDate") ?? defaultDate),
      description: String(form.get("description") ?? "") || null,
    };

    try {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось сделать перевод");
        return;
      }
      formEl.reset();
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  if (activeAccounts.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Добавь хотя бы два счёта, чтобы переводить деньги между ними.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 card-soft p-4">
      <h2 className="font-medium">Перевод</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="fromAccountId">Откуда</Label>
          <select
            id="fromAccountId"
            name="fromAccountId"
            required
            defaultValue={activeAccounts[0]?.id}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="toAccountId">Куда</Label>
          <select
            id="toAccountId"
            name="toAccountId"
            required
            defaultValue={activeAccounts[1]?.id}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="amount">Сумма</Label>
          <Input id="amount" name="amount" inputMode="decimal" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="transferDate">Дата</Label>
          <Input
            id="transferDate"
            name="transferDate"
            type="date"
            defaultValue={defaultDate}
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Описание</Label>
        <Input id="description" name="description" placeholder="Необязательно" />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Переводим…" : "Перевести"}
      </Button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCOUNT_TYPES = [
  { value: "bank_account", label: "Банковский счёт" },
  { value: "credit_card", label: "Кредитная карта" },
  { value: "cash", label: "Наличные" },
  { value: "savings", label: "Сбережения" },
  { value: "investment", label: "Инвестиции" },
  { value: "other", label: "Другое" },
] as const;

type Props = {
  defaultCurrency: string;
};

export function CreateAccountForm({ defaultCurrency }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "cash"),
      currency: String(form.get("currency") ?? defaultCurrency),
      initialBalance: String(form.get("initialBalance") ?? "0"),
      isShared: form.get("isShared") === "on",
      note: String(form.get("note") ?? "") || null,
    };

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать счёт");
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

  return (
    <form onSubmit={onSubmit} className="grid gap-3 card-soft p-4">
      <h2 className="font-medium">Добавить счёт</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Название</Label>
          <Input id="name" name="name" required placeholder="Основная карта" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="type">Тип</Label>
          <select
            id="type"
            name="type"
            defaultValue="bank_account"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="initialBalance">Начальный баланс</Label>
          <Input
            id="initialBalance"
            name="initialBalance"
            inputMode="decimal"
            defaultValue="0,00"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Валюта</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={defaultCurrency}
            maxLength={3}
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note">Заметка</Label>
        <Input id="note" name="note" placeholder="Необязательно" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="isShared" name="isShared" type="checkbox" defaultChecked />
        Общий для семьи
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Сохраняем…" : "Создать счёт"}
      </Button>
    </form>
  );
}

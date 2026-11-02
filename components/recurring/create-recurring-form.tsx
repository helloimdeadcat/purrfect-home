"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryOption } from "@/lib/data/categories";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
};

type Props = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultCurrency: string;
};

export function CreateRecurringForm({
  accounts,
  categories,
  defaultCurrency,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [frequency, setFrequency] = useState("monthly");
  const [type, setType] = useState<"expense" | "income">("expense");

  const filteredCategories = categories.filter(
    (category) => category.type === type || category.type === "both",
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const accountId = String(form.get("accountId") ?? "");
    const account = accounts.find((entry) => entry.id === accountId);
    const intervalRaw = String(form.get("intervalDays") ?? "");
    const payload = {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "expense"),
      amount: String(form.get("amount") ?? ""),
      currency: account?.currency ?? defaultCurrency,
      categoryId: String(form.get("categoryId") ?? ""),
      accountId,
      frequency: String(form.get("frequency") ?? "monthly"),
      intervalDays:
        frequency === "custom" && intervalRaw
          ? Number(intervalRaw)
          : null,
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? "") || null,
      description: String(form.get("description") ?? ""),
      isMandatory: form.get("isMandatory") === "on",
    };

    try {
      const response = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать регулярный платёж");
        return;
      }
      formEl.reset();
      setFrequency("monthly");
      setType("expense");
      router.refresh();
    } catch {
      setError("Ошибка сети — проверь подключение и попробуй ещё раз");
    } finally {
      setPending(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Сначала создай счёт, а потом добавляй регулярные платежи.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">Новый регулярный платёж</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="rp-name">Название</Label>
          <Input id="rp-name" name="name" required maxLength={120} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-type">Тип</Label>
          <select
            id="rp-type"
            name="type"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={type}
            onChange={(event) =>
              setType(event.target.value as "expense" | "income")
            }
          >
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-amount">Сумма</Label>
          <Input
            id="rp-amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="50,00"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-account">Счёт</Label>
          <select
            id="rp-account"
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
          <Label htmlFor="rp-category">Категория</Label>
          <select
            id="rp-category"
            name="categoryId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Выбери категорию
            </option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-frequency">Как часто</Label>
          <select
            id="rp-frequency"
            name="frequency"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="weekly">Каждую неделю</option>
            <option value="monthly">Каждый месяц</option>
            <option value="yearly">Каждый год</option>
            <option value="daily">Каждый день</option>
            <option value="custom">Свой интервал (дни)</option>
          </select>
        </div>
        {frequency === "custom" ? (
          <div className="grid gap-2">
            <Label htmlFor="rp-interval">Интервал (дни)</Label>
            <Input
              id="rp-interval"
              name="intervalDays"
              type="number"
              min={1}
              required
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="rp-start">Начало / следующая дата</Label>
          <Input id="rp-start" name="startDate" type="date" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-end">Дата окончания (необязательно)</Label>
          <Input id="rp-end" name="endDate" type="date" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="rp-description">Описание (необязательно)</Label>
          <Textarea id="rp-description" name="description" rows={2} />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="isMandatory"
            defaultChecked
            className="mt-0.5"
          />
          <span>
            Обязательный платёж
            <span className="block text-muted-foreground">
              Обязательные расходы вычитаются из «Можно потратить». Сними галочку
              для необязательных (например, подписок, которые можно отменить) —
              они всё равно учитываются в прогнозе баланса.
            </span>
          </span>
        </label>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Создаём…" : "Создать"}
      </Button>
    </form>
  );
}

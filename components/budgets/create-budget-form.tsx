"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryOption } from "@/lib/data/categories";

type Props = {
  month: string;
  currency: string;
  categories: CategoryOption[];
  usedCategoryIds: string[];
};

export function CreateBudgetForm({
  month,
  currency,
  categories,
  usedCategoryIds,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const available = categories.filter((c) => !usedCategoryIds.includes(c.id));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      categoryId: String(form.get("categoryId") ?? ""),
      amount: String(form.get("amount") ?? ""),
      month,
    };

    try {
      const response = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать бюджет");
        return;
      }
      formEl.reset();
      router.refresh();
    } catch {
      setError("Ошибка сети — проверь подключение и попробуй ещё раз");
    } finally {
      setPending(false);
    }
  }

  if (available.length === 0) {
    return (
      <div className="card-soft p-4 text-sm text-muted-foreground">
        У всех категорий расходов уже есть бюджет на этот месяц.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">Добавить бюджет для категории</h2>
      <p className="text-sm text-muted-foreground">
        Лимит задаётся в валюте семьи ({currency}). Переводы и удалённые
        операции не учитываются.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="budget-category">Категория</Label>
          <select
            id="budget-category"
            name="categoryId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Выбери категорию
            </option>
            {available.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budget-amount">Лимит на месяц ({currency})</Label>
          <Input
            id="budget-amount"
            name="amount"
            inputMode="decimal"
            placeholder="200,00"
            required
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Создаём…" : "Создать бюджет"}
      </Button>
    </form>
  );
}

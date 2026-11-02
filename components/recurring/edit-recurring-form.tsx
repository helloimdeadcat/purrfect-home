"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryOption } from "@/lib/data/categories";
import type { RecurringPaymentView } from "@/services/recurring-service";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
};

type Props = {
  payment: RecurringPaymentView;
  accounts: AccountOption[];
  categories: CategoryOption[];
  onClose: () => void;
};

export function EditRecurringForm({
  payment,
  accounts,
  categories,
  onClose,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [frequency, setFrequency] = useState(payment.frequency);
  const [type, setType] = useState<"expense" | "income">(payment.type);

  const filteredCategories = categories.filter(
    (category) => category.type === type || category.type === "both",
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const intervalRaw = String(form.get("intervalDays") ?? "");
    const payload = {
      name: String(form.get("name") ?? ""),
      type,
      amount: String(form.get("amount") ?? ""),
      categoryId: String(form.get("categoryId") ?? ""),
      accountId: String(form.get("accountId") ?? ""),
      frequency,
      intervalDays:
        frequency === "custom" && intervalRaw
          ? Number(intervalRaw)
          : frequency === "custom"
            ? null
            : payment.interval_days,
      endDate: String(form.get("endDate") ?? "") || null,
      description: String(form.get("description") ?? "") || null,
      // Only sent when it changes, so editing works before the migration
      // that adds the column has been applied.
      ...((form.get("isMandatory") === "on") !== (payment.is_mandatory !== false)
        ? { isMandatory: form.get("isMandatory") === "on" }
        : {}),
    };

    try {
      const response = await fetch(`/api/recurring/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось сохранить");
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-lg border border-border p-3"
    >
      <p className="text-sm font-medium">Изменить шаблон</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`edit-name-${payment.id}`}>Название</Label>
          <Input
            id={`edit-name-${payment.id}`}
            name="name"
            required
            maxLength={120}
            defaultValue={payment.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`edit-type-${payment.id}`}>Тип</Label>
          <select
            id={`edit-type-${payment.id}`}
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
          <Label htmlFor={`edit-amount-${payment.id}`}>Сумма</Label>
          <Input
            id={`edit-amount-${payment.id}`}
            name="amount"
            inputMode="decimal"
            required
            defaultValue={payment.amount}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`edit-account-${payment.id}`}>Счёт</Label>
          <select
            id={`edit-account-${payment.id}`}
            name="accountId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue={payment.account_id}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`edit-category-${payment.id}`}>Категория</Label>
          <select
            id={`edit-category-${payment.id}`}
            name="categoryId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue={payment.category_id}
          >
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`edit-frequency-${payment.id}`}>Как часто</Label>
          <select
            id={`edit-frequency-${payment.id}`}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={frequency}
            onChange={(event) =>
              setFrequency(
                event.target.value as RecurringPaymentView["frequency"],
              )
            }
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
            <Label htmlFor={`edit-interval-${payment.id}`}>Интервал (дни)</Label>
            <Input
              id={`edit-interval-${payment.id}`}
              name="intervalDays"
              type="number"
              min={1}
              required
              defaultValue={payment.interval_days ?? undefined}
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={`edit-end-${payment.id}`}>Дата окончания</Label>
          <Input
            id={`edit-end-${payment.id}`}
            name="endDate"
            type="date"
            defaultValue={payment.end_date ?? undefined}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`edit-desc-${payment.id}`}>Описание</Label>
          <Textarea
            id={`edit-desc-${payment.id}`}
            name="description"
            rows={2}
            defaultValue={payment.description ?? ""}
          />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="isMandatory"
            defaultChecked={payment.is_mandatory !== false}
            className="mt-0.5"
          />
          <span>
            Обязательный платёж
            <span className="block text-muted-foreground">
              Вычитается из «Можно потратить». Необязательные платежи влияют
              только на прогноз баланса.
            </span>
          </span>
        </label>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onClose}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string };

type Props = {
  canEdit: boolean;
  householdName: string;
  baseCurrency: string;
  timezone: string;
  weekStartsOn: number;
  monthStartsOn: number;
  defaultAccountId: string | null;
  defaultCategoryId: string | null;
  /** Undefined when the database has no reserve column yet. */
  reserves?: Record<string, string>;
  reserveCurrencies: string[];
  accounts: Option[];
  categories: Option[];
};

export function HouseholdSettingsForm({
  canEdit,
  householdName,
  baseCurrency,
  timezone,
  weekStartsOn,
  monthStartsOn,
  defaultAccountId,
  defaultCategoryId,
  reserves,
  reserveCurrencies,
  accounts,
  categories,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
    setSuccess(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const accountRaw = String(form.get("defaultAccountId") ?? "");
    const categoryRaw = String(form.get("defaultCategoryId") ?? "");
    try {
      const response = await fetch("/api/settings/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: String(form.get("timezone") ?? ""),
          weekStartsOn: Number(form.get("weekStartsOn")),
          monthStartsOn: Number(form.get("monthStartsOn")),
          defaultAccountId: accountRaw || null,
          defaultCategoryId: categoryRaw || null,
          ...(reserves !== undefined
            ? {
                safeToSpendReserves: Object.fromEntries(
                  reserveCurrencies.map((code) => [
                    code,
                    String(form.get(`reserve-${code}`) ?? "").trim() || "0",
                  ]),
                ),
              }
            : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось сохранить настройки");
        return;
      }
      setSuccess("Настройки семьи сохранены 🐾");
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
      className="grid gap-3 card-soft p-4"
    >
      <div>
        <h2 className="font-medium">Семья</h2>
        <p className="text-sm text-muted-foreground">
          {householdName} · основная валюта {baseCurrency} (у счетов может быть
          другая валюта; курсы не пересчитываются)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="timezone">Часовой пояс</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            disabled={!canEdit}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="weekStartsOn">Неделя начинается с</Label>
          <select
            id="weekStartsOn"
            name="weekStartsOn"
            defaultValue={weekStartsOn}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value={1}>понедельника</option>
            <option value={0}>воскресенья</option>
            <option value={6}>субботы</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="monthStartsOn">Месяц начинается с (число)</Label>
          <Input
            id="monthStartsOn"
            name="monthStartsOn"
            type="number"
            min={1}
            max={28}
            defaultValue={monthStartsOn}
            disabled={!canEdit}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="defaultAccountId">Счёт по умолчанию</Label>
          <select
            id="defaultAccountId"
            name="defaultAccountId"
            defaultValue={defaultAccountId ?? ""}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Не выбран</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="defaultCategoryId">Категория по умолчанию</Label>
          <select
            id="defaultCategoryId"
            name="defaultCategoryId"
            defaultValue={defaultCategoryId ?? ""}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Не выбран</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {reserves !== undefined ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Резерв для «Можно потратить»</legend>
          <p className="text-sm text-muted-foreground">
            Деньги, которые лучше не трогать. Они вычитаются из «Можно потратить»
            отдельно по каждой валюте (без пересчёта). Оставь 0, если резерв не нужен.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {reserveCurrencies.map((code) => (
              <div key={code} className="grid gap-1">
                <Label htmlFor={`reserve-${code}`}>{code}</Label>
                <Input
                  id={`reserve-${code}`}
                  name={`reserve-${code}`}
                  inputMode="decimal"
                  defaultValue={reserves[code] ?? "0.00"}
                  disabled={!canEdit}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          Настройки семьи могут менять только владелец и админы.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить настройки семьи"}
        </Button>
      ) : null}
    </form>
  );
}

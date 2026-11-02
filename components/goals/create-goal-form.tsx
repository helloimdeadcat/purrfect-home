"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  defaultCurrency: string;
};

export function CreateGoalForm({ defaultCurrency }: Props) {
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
      targetAmount: String(form.get("targetAmount") ?? ""),
      currency: String(form.get("currency") ?? defaultCurrency),
      description: String(form.get("description") ?? ""),
      targetDate: String(form.get("targetDate") ?? ""),
      initialAmount: String(form.get("initialAmount") ?? "0") || "0",
    };

    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать цель");
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

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">Новая цель</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="goal-name">Название</Label>
          <Input id="goal-name" name="name" required maxLength={120} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-target">Сколько нужно</Label>
          <Input
            id="goal-target"
            name="targetAmount"
            inputMode="decimal"
            placeholder="1000,00"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-currency">Валюта</Label>
          <Input
            id="goal-currency"
            name="currency"
            defaultValue={defaultCurrency}
            maxLength={3}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-initial">Уже накоплено</Label>
          <Input
            id="goal-initial"
            name="initialAmount"
            inputMode="decimal"
            defaultValue="0"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-date">К какой дате (необязательно)</Label>
          <Input id="goal-date" name="targetDate" type="date" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="goal-description">Описание (необязательно)</Label>
          <Textarea id="goal-description" name="description" rows={2} />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Создаём…" : "Создать цель"}
      </Button>
    </form>
  );
}

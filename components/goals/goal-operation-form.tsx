"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  goalId: string;
  currency: string;
  mode: "deposit" | "withdraw" | "adjust";
  onDone?: () => void;
};

const LABELS = {
  deposit: { title: "Пополнить", amount: "Сумма пополнения", submit: "Пополнить" },
  withdraw: {
    title: "Снять",
    amount: "Сумма снятия",
    submit: "Снять",
  },
  adjust: {
    title: "Задать баланс",
    amount: "Новый баланс",
    submit: "Скорректировать",
  },
} as const;

export function GoalOperationForm({ goalId, currency, mode, onDone }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const labels = LABELS[mode];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      type: mode,
      amount: String(form.get("amount") ?? ""),
      note: String(form.get("note") ?? "") || null,
    };

    try {
      const response = await fetch(`/api/goals/${goalId}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось выполнить операцию");
        return;
      }
      formEl.reset();
      onDone?.();
      router.refresh();
    } catch {
      setError("Ошибка сети — проверь подключение и попробуй ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{labels.title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${mode}-amount-${goalId}`}>
            {labels.amount} ({currency})
          </Label>
          <Input
            id={`${mode}-amount-${goalId}`}
            name="amount"
            inputMode="decimal"
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${mode}-note-${goalId}`}>Заметка (необязательно)</Label>
          <Input id={`${mode}-note-${goalId}`} name="note" maxLength={300} />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Сохраняем…" : labels.submit}
      </Button>
    </form>
  );
}

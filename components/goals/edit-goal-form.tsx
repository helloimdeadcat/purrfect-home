"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  goalId: string;
  name: string;
  targetAmount: string;
  description: string | null;
  targetDate: string | null;
  currency: string;
  onDone?: () => void;
};

export function EditGoalForm({
  goalId,
  name,
  targetAmount,
  description,
  targetDate,
  currency,
  onDone,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      targetAmount: String(form.get("targetAmount") ?? ""),
      description: String(form.get("description") ?? "") || null,
      targetDate: String(form.get("targetDate") ?? "") || null,
    };

    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось обновить цель");
        return;
      }
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
      <p className="text-sm font-medium">Изменить цель</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor={`edit-name-${goalId}`}>Название</Label>
          <Input
            id={`edit-name-${goalId}`}
            name="name"
            defaultValue={name}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`edit-target-${goalId}`}>Цель ({currency})</Label>
          <Input
            id={`edit-target-${goalId}`}
            name="targetAmount"
            inputMode="decimal"
            defaultValue={targetAmount}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`edit-date-${goalId}`}>К какой дате</Label>
          <Input
            id={`edit-date-${goalId}`}
            name="targetDate"
            type="date"
            defaultValue={targetDate ?? ""}
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor={`edit-desc-${goalId}`}>Описание</Label>
          <Textarea
            id={`edit-desc-${goalId}`}
            name="description"
            rows={2}
            defaultValue={description ?? ""}
          />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}

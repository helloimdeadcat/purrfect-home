"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  budgetId: string;
  currentAmount: string;
  currency: string;
};

export function EditBudgetForm({ budgetId, currentAmount, currency }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const amount = String(new FormData(formEl).get("amount") ?? "");

    try {
      const response = await fetch(`/api/budgets/${budgetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to update budget");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor={`edit-${budgetId}`} className="sr-only">
          New limit ({currency})
        </Label>
        <Input
          id={`edit-${budgetId}`}
          name="amount"
          inputMode="decimal"
          defaultValue={currentAmount}
          required
          className="w-28"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
      {error ? (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

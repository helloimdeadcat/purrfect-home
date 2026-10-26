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
        setError(data.error ?? "Failed to create budget");
        return;
      }
      formEl.reset();
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setPending(false);
    }
  }

  if (available.length === 0) {
    return (
      <div className="card-soft p-4 text-sm text-muted-foreground">
        All expense categories already have a budget for this month.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">Add category budget</h2>
      <p className="text-sm text-muted-foreground">
        Limit is in household currency ({currency}). Transfers and deleted
        transactions are not counted.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="budget-category">Category</Label>
          <select
            id="budget-category"
            name="categoryId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select category
            </option>
            {available.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budget-amount">Monthly limit ({currency})</Label>
          <Input
            id="budget-amount"
            name="amount"
            inputMode="decimal"
            placeholder="200.00"
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
        {pending ? "Creating…" : "Create budget"}
      </Button>
    </form>
  );
}

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
        setError(data.error ?? "Failed to create recurring payment");
        return;
      }
      formEl.reset();
      setFrequency("monthly");
      setType("expense");
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setPending(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create an account before adding recurring payments.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">New recurring payment</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="rp-name">Name</Label>
          <Input id="rp-name" name="name" required maxLength={120} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-type">Type</Label>
          <select
            id="rp-type"
            name="type"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={type}
            onChange={(event) =>
              setType(event.target.value as "expense" | "income")
            }
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-amount">Amount</Label>
          <Input
            id="rp-amount"
            name="amount"
            inputMode="decimal"
            required
            placeholder="50.00"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-account">Account</Label>
          <select
            id="rp-account"
            name="accountId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-category">Category</Label>
          <select
            id="rp-category"
            name="categoryId"
            required
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select category
            </option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-frequency">Frequency</Label>
          <select
            id="rp-frequency"
            name="frequency"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="daily">Daily</option>
            <option value="custom">Custom (days)</option>
          </select>
        </div>
        {frequency === "custom" ? (
          <div className="grid gap-2">
            <Label htmlFor="rp-interval">Interval (days)</Label>
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
          <Label htmlFor="rp-start">Start / next date</Label>
          <Input id="rp-start" name="startDate" type="date" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rp-end">End date (optional)</Label>
          <Input id="rp-end" name="endDate" type="date" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="rp-description">Description (optional)</Label>
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
            Mandatory payment
            <span className="block text-muted-foreground">
              Mandatory expenses are reserved from Safe-to-Spend. Untick for
              optional ones (subscriptions you could cancel) — they still
              appear in the forecast balance.
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
        {pending ? "Creating…" : "Create"}
      </Button>
    </form>
  );
}

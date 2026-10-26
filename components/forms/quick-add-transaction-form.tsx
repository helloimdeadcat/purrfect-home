"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountOption = { id: string; name: string; is_active: boolean };
type CategoryOption = {
  id: string;
  name: string;
  type: "expense" | "income" | "both";
  parent_id: string | null;
};
type TagOption = { id: string; name: string };
type IncomeSourceOption = { id: string; name: string };

type Props = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  tags?: TagOption[];
  incomeSources?: IncomeSourceOption[];
  /** Household-local today (YYYY-MM-DD) from the server — same on SSR and client. */
  defaultDate: string;
};

export function QuickAddTransactionForm({
  accounts,
  categories,
  tags = [],
  incomeSources = [],
  defaultDate,
}: Props) {
  const router = useRouter();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const activeAccounts = accounts.filter((account) => account.is_active);
  const filteredCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.type === type || category.type === "both",
      ),
    [categories, type],
  );

  function toggleTag(tagId: string) {
    setSelectedTags((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const categoryId = String(form.get("categoryId") ?? "");
    const incomeSourceId = String(form.get("incomeSourceId") ?? "");
    const payload = {
      type,
      amount: String(form.get("amount") ?? ""),
      accountId: String(form.get("accountId") ?? ""),
      categoryId: categoryId || null,
      transactionDate: String(form.get("transactionDate") ?? defaultDate),
      description: String(form.get("description") ?? "") || null,
      merchant: String(form.get("merchant") ?? "") || null,
      isNecessary: true,
      tagIds: selectedTags,
      incomeSourceId:
        type === "income" && incomeSourceId ? incomeSourceId : null,
    };

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to save transaction");
        return;
      }
      formEl.reset();
      setType("expense");
      setSelectedTags([]);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (activeAccounts.length === 0) {
    return (
      <p className="card-soft p-4 text-sm text-muted-foreground">
        Create an account first, then you can add transactions.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 card-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Quick add</h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={type === "expense" ? "default" : "ghost"}
            onClick={() => setType("expense")}
          >
            Expense
          </Button>
          <Button
            type="button"
            size="sm"
            variant={type === "income" ? "default" : "ghost"}
            onClick={() => setType("income")}
          >
            Income
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          autoFocus
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="accountId">Account</Label>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue={activeAccounts[0]?.id}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="categoryId">Category</Label>
          <select
            id="categoryId"
            name="categoryId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="">No category</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type === "income" && incomeSources.length > 0 ? (
        <div className="grid gap-2">
          <Label htmlFor="incomeSourceId">Income source</Label>
          <select
            id="incomeSourceId"
            name="incomeSourceId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="">None</option>
            {incomeSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="grid gap-2">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = selectedTags.includes(tag.id);
              return (
                <Button
                  key={tag.id}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="transactionDate">Date</Label>
          <Input
            id="transactionDate"
            name="transactionDate"
            type="date"
            defaultValue={defaultDate}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="merchant">Merchant</Label>
          <Input id="merchant" name="merchant" placeholder="Optional" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" placeholder="Optional" />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : `Add ${type}`}
      </Button>
    </form>
  );
}

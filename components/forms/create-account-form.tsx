"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCOUNT_TYPES = [
  { value: "bank_account", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  defaultCurrency: string;
};

export function CreateAccountForm({ defaultCurrency }: Props) {
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
      type: String(form.get("type") ?? "cash"),
      currency: String(form.get("currency") ?? defaultCurrency),
      initialBalance: String(form.get("initialBalance") ?? "0"),
      isShared: form.get("isShared") === "on",
      note: String(form.get("note") ?? "") || null,
    };

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to create account");
        return;
      }
      formEl.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 card-soft p-4">
      <h2 className="font-medium">Add account</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="Main checking" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue="bank_account"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="initialBalance">Initial balance</Label>
          <Input
            id="initialBalance"
            name="initialBalance"
            inputMode="decimal"
            defaultValue="0.00"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={defaultCurrency}
            maxLength={3}
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="note">Note</Label>
        <Input id="note" name="note" placeholder="Optional" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input id="isShared" name="isShared" type="checkbox" defaultChecked />
        Shared with household
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Create account"}
      </Button>
    </form>
  );
}

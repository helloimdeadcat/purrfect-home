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
        setError(data.error ?? "Failed to save settings");
        return;
      }
      setSuccess("Household settings saved");
      router.refresh();
    } catch {
      setError("Network error");
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
        <h2 className="font-medium">Household</h2>
        <p className="text-sm text-muted-foreground">
          {householdName} · base currency {baseCurrency} (accounts may use other
          currencies; no FX conversion)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            disabled={!canEdit}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="weekStartsOn">Week starts on</Label>
          <select
            id="weekStartsOn"
            name="weekStartsOn"
            defaultValue={weekStartsOn}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
            <option value={6}>Saturday</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="monthStartsOn">Month starts on (day)</Label>
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
          <Label htmlFor="defaultAccountId">Default account</Label>
          <select
            id="defaultAccountId"
            name="defaultAccountId"
            defaultValue={defaultAccountId ?? ""}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">None</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="defaultCategoryId">Default category</Label>
          <select
            id="defaultCategoryId"
            name="defaultCategoryId"
            defaultValue={defaultCategoryId ?? ""}
            disabled={!canEdit}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">None</option>
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
          <legend className="text-sm font-medium">Safe-to-Spend reserve</legend>
          <p className="text-sm text-muted-foreground">
            Money to keep untouched. It is subtracted from Safe-to-Spend in
            each currency separately (no conversion). Leave 0 for no reserve.
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
          Only owners and admins can change household settings.
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
          {pending ? "Saving…" : "Save household settings"}
        </Button>
      ) : null}
    </form>
  );
}

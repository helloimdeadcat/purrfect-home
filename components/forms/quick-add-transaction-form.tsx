"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestReceiptScan, type ReceiptScanResult } from "@/lib/receipt-scan-client";

type AccountOption = { id: string; name: string; is_active: boolean; currency?: string };
type ScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; notes: string[] }
  | { status: "error"; message: string };
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
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Field names the user has edited by hand — a scan never overwrites them. */
  const touchedFields = useRef(new Set<string>());

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

  function onFieldChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.name && target.type !== "file") touchedFields.current.add(target.name);
  }

  /** Writes scanned values into fields the user has not touched yet. */
  function applyScan(result: ReceiptScanResult): string[] {
    const form = formRef.current;
    if (!form) return [];
    const notes: string[] = [];
    const field = (name: string) =>
      form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    const fill = (name: string, value: string | null) => {
      const element = field(name);
      if (!element || value === null || touchedFields.current.has(name)) return false;
      if (
        element instanceof HTMLSelectElement &&
        !Array.from(element.options).some((option) => option.value === value)
      ) {
        return false;
      }
      element.value = value;
      return true;
    };

    const filledAmount = fill("amount", result.amount?.replace(".", ",") ?? null);
    const filledDate = fill("transactionDate", result.date);
    const filledMerchant = fill("merchant", result.merchant);
    const filledCategory = fill("categoryId", result.categoryId);
    if (result.items.length > 0) {
      fill("description", result.items.slice(0, 5).join(", ").slice(0, 200));
    }

    if (result.currency) {
      const selectedId = field("accountId")?.value;
      const selected = activeAccounts.find((account) => account.id === selectedId);
      const same = (account: AccountOption) =>
        account.currency?.toUpperCase() === result.currency;
      if (selected?.currency && !same(selected)) {
        const match = activeAccounts.find(same);
        if (!match || !fill("accountId", match.id)) {
          notes.push(
            `На чеке валюта ${result.currency}, а счёт в ${selected.currency.toUpperCase()} — проверь счёт и сумму.`,
          );
        }
      }
    }

    if (!filledAmount && !filledDate && !filledMerchant && !filledCategory) {
      if (!result.amount && !result.date && !result.merchant) {
        return ["Не получилось ничего распознать — попробуй фото почётче или при лучшем свете."];
      }
      notes.push("Ты уже заполнил(а) поля сам(а) — их я не трогал.");
    }
    if (!result.amount) notes.push("Сумму прочитать не вышло — впиши её сам(а).");
    notes.push("Проверь сумму и дату перед сохранением.");
    return notes;
  }

  async function onReceiptChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same photo again
    if (!file) return;
    setScan({ status: "loading" });
    const response = await requestReceiptScan(file);
    if (!response.ok) {
      setScan({ status: "error", message: response.message });
      return;
    }
    setScan({ status: "done", notes: applyScan(response.result) });
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
        setError(data.error ?? "Не получилось сохранить операцию");
        return;
      }
      formEl.reset();
      setType("expense");
      setSelectedTags([]);
      touchedFields.current.clear();
      setScan({ status: "idle" });
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  if (activeAccounts.length === 0) {
    return (
      <p className="card-soft p-4 text-sm text-muted-foreground">
        Сначала создай счёт — потом можно будет добавлять операции.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onChange={onFieldChange}
      className="grid gap-3 card-soft p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Быстро добавить</h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={type === "expense" ? "default" : "ghost"}
            onClick={() => setType("expense")}
          >
            Расход
          </Button>
          <Button
            type="button"
            size="sm"
            variant={type === "income" ? "default" : "ghost"}
            onClick={() => setType("income")}
          >
            Доход
          </Button>
        </div>
      </div>

      {type === "expense" ? (
        <div className="grid gap-1.5">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onReceiptChosen}
              aria-label="Фото чека"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={scan.status === "loading"}
              onClick={() => fileInputRef.current?.click()}
            >
              {scan.status === "loading" ? "Морти читает чек…" : "📷 Распознать чек"}
            </Button>
          </div>
          {scan.status === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {scan.message}
            </p>
          ) : null}
          {scan.status === "done" ? (
            <div className="grid gap-0.5 text-sm text-muted-foreground" role="status">
              {scan.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Фото уходит в Google Gemini только для распознавания и нигде не сохраняется.
          </p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="amount">Сумма</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          required
          autoFocus
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="accountId">Счёт</Label>
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
          <Label htmlFor="categoryId">Категория</Label>
          <select
            id="categoryId"
            name="categoryId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="">Без категории</option>
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
          <Label htmlFor="incomeSourceId">Источник дохода</Label>
          <select
            id="incomeSourceId"
            name="incomeSourceId"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue=""
          >
            <option value="">Не указан</option>
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
          <Label>Метки</Label>
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
          <Label htmlFor="transactionDate">Дата</Label>
          <Input
            id="transactionDate"
            name="transactionDate"
            type="date"
            defaultValue={defaultDate}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="merchant">Где / у кого</Label>
          <Input id="merchant" name="merchant" placeholder="Необязательно" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Описание</Label>
        <Input id="description" name="description" placeholder="Необязательно" />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Сохраняем…" : type === "expense" ? "Добавить расход" : "Добавить доход"}
      </Button>
    </form>
  );
}

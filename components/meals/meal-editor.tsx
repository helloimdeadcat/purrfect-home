"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SLOT_LABEL, SLOT_ORDER, WEIGH_LABEL } from "@/lib/meals/labels";
import type { MealSlot, WeighMode } from "@/types/database";

type PersonCol = { memberId: string; label: string; color: string };
type FoodOption = { id: string; name: string; weigh_mode: WeighMode | null };

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    details?: { fieldErrors?: Record<string, string[]> };
  };
  const field = data.details?.fieldErrors ? Object.values(data.details.fieldErrors).flat()[0] : null;
  return field ?? data.error ?? "Couldn't save";
}

function parseGrams(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.min(5000, n) : 0;
}

export function MealEditor({
  meal,
  rows,
  foods,
  people,
  totalsLines,
}: {
  meal: { id: string; title: string; slot: MealSlot };
  /** One row per food: grams per member id. */
  rows: { foodId: string; grams: Record<string, number> }[];
  foods: FoodOption[];
  people: PersonCol[];
  totalsLines: { label: string; line: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newFood, setNewFood] = useState("");
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const used = new Set(rows.map((r) => r.foodId));

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const problem = await action();
    setBusy(false);
    if (problem) setError(problem);
    else router.refresh();
  }

  function saveRow(foodId: string, grams: Record<string, number>) {
    return run(() =>
      send("/api/meals/portions", "PUT", {
        mealId: meal.id,
        foodId,
        grams: people.map((p) => ({ memberId: p.memberId, grams: grams[p.memberId] ?? 0 })),
      }),
    );
  }

  return (
    <article className="card-soft grid min-w-0 gap-3 p-4">
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
        <select
          aria-label="Meal"
          defaultValue={meal.slot}
          className={SELECT_CLASS}
          disabled={busy}
          onChange={(e) => void run(() => send(`/api/meals/meals/${meal.id}`, "PATCH", { slot: e.target.value }))}
        >
          {SLOT_ORDER.map((slot) => (
            <option key={slot} value={slot}>
              {SLOT_LABEL[slot]}
            </option>
          ))}
        </select>
        <Input
          aria-label="Dish"
          defaultValue={meal.title}
          maxLength={160}
          className="font-semibold"
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== meal.title) {
              void run(() => send(`/api/meals/meals/${meal.id}`, "PATCH", { title }));
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove "${meal.title}" from this day?`)) {
              void run(() => send(`/api/meals/meals/${meal.id}`, "DELETE"));
            }
          }}
        >
          Remove meal
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-1 text-left font-normal">Food</th>
              {people.map((p) => (
                <th key={p.memberId} className="w-24 pb-1 text-right font-normal">
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: p.color }} />
                    {p.label}, g
                  </span>
                </th>
              ))}
              <th className="w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const food = foodById.get(row.foodId);
              return (
                <tr key={row.foodId} className="border-t border-border/60">
                  <td className="py-1 pr-2">
                    {food?.name ?? "Unknown food"}
                    {food?.weigh_mode ? (
                      <abbr title={WEIGH_LABEL[food.weigh_mode].text} className="ml-1 text-[10px] font-semibold text-muted-foreground no-underline">
                        {WEIGH_LABEL[food.weigh_mode].code}
                      </abbr>
                    ) : null}
                  </td>
                  {people.map((p) => (
                    <td key={p.memberId} className="py-1 pl-1">
                      <Input
                        aria-label={`${food?.name ?? "Food"}, grams for ${p.label}`}
                        inputMode="decimal"
                        defaultValue={row.grams[p.memberId] ? String(row.grams[p.memberId]) : ""}
                        className="h-8 text-right tabular-nums"
                        onBlur={(e) => {
                          const value = parseGrams(e.target.value);
                          if (value !== (row.grams[p.memberId] ?? 0)) {
                            void saveRow(row.foodId, { ...row.grams, [p.memberId]: value });
                          }
                        }}
                      />
                    </td>
                  ))}
                  <td className="py-1 text-right">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label={`Remove ${food?.name ?? "food"}`}
                      disabled={busy}
                      onClick={() => void saveRow(row.foodId, {})}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newFood) return;
          const form = new FormData(e.currentTarget);
          const grams = Object.fromEntries(people.map((p) => [p.memberId, parseGrams(String(form.get(p.memberId) ?? ""))]));
          if (Object.values(grams).every((g) => g === 0)) {
            setError("Enter grams for at least one person");
            return;
          }
          const formEl = e.currentTarget;
          void saveRow(newFood, grams).then(() => {
            formEl.reset();
            setNewFood("");
          });
        }}
      >
        <select
          aria-label="Add food"
          value={newFood}
          onChange={(e) => setNewFood(e.target.value)}
          className={`${SELECT_CLASS} min-w-40 flex-1`}
        >
          <option value="">＋ Add food…</option>
          {foods
            .filter((f) => !used.has(f.id))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        {newFood
          ? people.map((p) => (
              <Input
                key={p.memberId}
                name={p.memberId}
                inputMode="decimal"
                placeholder={`${p.label}, g`}
                aria-label={`Grams for ${p.label}`}
                className="h-9 w-24 text-right"
              />
            ))
          : null}
        {newFood ? (
          <Button type="submit" size="sm" disabled={busy}>
            Add
          </Button>
        ) : null}
      </form>

      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {totalsLines.map((t) => (
          <li key={t.label}>
            <span className="font-medium text-foreground">{t.label}:</span> {t.line}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

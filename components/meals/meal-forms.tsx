"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL, CATEGORY_ORDER, SLOT_LABEL, SLOT_ORDER, WEIGH_LABEL } from "@/lib/meals/labels";
import type { ShoppingCategory, WeighMode } from "@/types/database";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  };
  const field = data.details?.fieldErrors ? Object.values(data.details.fieldErrors).flat()[0] : data.details?.formErrors?.[0];
  return field ?? data.error ?? "Couldn't save";
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<string | null>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    const problem = await action();
    setBusy(false);
    if (problem) {
      setError(problem);
    } else {
      onOk?.();
      router.refresh();
    }
  }
  return { busy, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;
}

/** Shown when there is no plan: import the 7-day plan or start empty. */
export function ImportPlanPanel({ people }: { people: { memberId: string; label: string }[] }) {
  const { busy, error, run } = useAction();
  const [husband, setHusband] = useState(people[0]?.memberId ?? "");
  const [wife, setWife] = useState(people[1]?.memberId ?? people[0]?.memberId ?? "");
  const [habits, setHabits] = useState(true);

  return (
    <section className="card-soft grid gap-4 p-4">
      <div>
        <h2 className="font-semibold">Load your 7-day plan</h2>
        <p className="text-sm text-muted-foreground">
          28 meals with grams for each of you, daily calorie and protein/fat
          targets, weighing rules and cooking tips — all editable afterwards.
        </p>
      </div>
      {people.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Invite your partner on the Family page first — the plan has portions for two.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-husband">«Муж» column is</Label>
              <select id="plan-husband" value={husband} onChange={(e) => setHusband(e.target.value)} className={SELECT_CLASS}>
                {people.map((p) => (
                  <option key={p.memberId} value={p.memberId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-wife">«Жена» column is</Label>
              <select id="plan-wife" value={wife} onChange={(e) => setWife(e.target.value)} className={SELECT_CLASS}>
                {people.map((p) => (
                  <option key={p.memberId} value={p.memberId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={habits} onChange={(e) => setHabits(e.target.checked)} className="mt-0.5" />
            <span>
              Also add the plan&apos;s habits: water (2.25 L / 1.75 L), steps
              (starting at 2 500) and strength training on Mon &amp; Thu.
            </span>
          </label>
        </>
      )}
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        {people.length >= 2 ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                send("/api/meals/import", "POST", { husbandMemberId: husband, wifeMemberId: wife, createHabits: habits }),
              )
            }
          >
            {busy ? "Loading…" : "Load the 7-day plan"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => send("/api/meals/plan", "POST"))}>
          Start an empty plan
        </Button>
      </div>
    </section>
  );
}

export function AddMealForm({ weekday }: { weekday: number }) {
  const { busy, error, run } = useAction();
  return (
    <form
      className="card-soft grid gap-2 p-4 sm:grid-cols-[9rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const form = new FormData(formEl);
        void run(
          () =>
            send("/api/meals/meals", "POST", {
              weekday,
              slot: String(form.get("slot")),
              title: String(form.get("title") ?? ""),
            }),
          () => formEl.reset(),
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`slot-${weekday}`}>Meal</Label>
        <select id={`slot-${weekday}`} name="slot" className={SELECT_CLASS} defaultValue="dinner">
          {SLOT_ORDER.map((slot) => (
            <option key={slot} value={slot}>
              {SLOT_LABEL[slot]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`title-${weekday}`}>Dish</Label>
        <Input id={`title-${weekday}`} name="title" required maxLength={160} placeholder="Chicken with buckwheat…" />
      </div>
      <Button type="submit" disabled={busy}>
        Add meal
      </Button>
      <div className="sm:col-span-3">
        <ErrorText error={error} />
      </div>
    </form>
  );
}

export function PlanNotesForm({ planId, notes }: { planId: string; notes: string | null }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="grid gap-2">
        <p className="text-sm whitespace-pre-line text-muted-foreground">{notes || "No notes yet."}</p>
        <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => setEditing(true)}>
          Edit notes
        </Button>
      </div>
    );
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void run(() => send(`/api/meals/plan/${planId}`, "PATCH", { notes: String(form.get("notes") ?? "") }), () =>
          setEditing(false),
        );
      }}
    >
      <Textarea name="notes" defaultValue={notes ?? ""} rows={12} maxLength={8000} />
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type FoodValues = {
  id?: string;
  name: string;
  weigh_mode: WeighMode | null;
  shopping_category: ShoppingCategory;
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  fiber: string;
};

/** Add or edit a catalogue food (values per 100 g). */
export function FoodForm({ food, onDone }: { food?: FoodValues; onDone?: () => void }) {
  const { busy, error, run } = useAction();
  const id = food?.id ?? "new";
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const form = new FormData(formEl);
        const weigh = String(form.get("weigh") ?? "");
        const body = {
          name: String(form.get("name") ?? ""),
          weighMode: weigh || null,
          category: String(form.get("category") ?? "other"),
          kcal: String(form.get("kcal") ?? "0"),
          protein: String(form.get("protein") ?? "0"),
          fat: String(form.get("fat") ?? "0"),
          carbs: String(form.get("carbs") ?? "0"),
          fiber: String(form.get("fiber") || "0"),
        };
        void run(
          () => send(food?.id ? `/api/meals/foods/${food.id}` : "/api/meals/foods", food?.id ? "PATCH" : "POST", body),
          () => {
            if (!food) formEl.reset();
            onDone?.();
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor={`food-name-${id}`}>Name</Label>
          <Input id={`food-name-${id}`} name="name" required maxLength={80} defaultValue={food?.name} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`food-weigh-${id}`}>Weighed</Label>
          <select id={`food-weigh-${id}`} name="weigh" defaultValue={food?.weigh_mode ?? ""} className={SELECT_CLASS}>
            <option value="">—</option>
            {(Object.keys(WEIGH_LABEL) as WeighMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {WEIGH_LABEL[mode].code} — {WEIGH_LABEL[mode].text}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`food-cat-${id}`}>Shopping aisle</Label>
          <select id={`food-cat-${id}`} name="category" defaultValue={food?.shopping_category ?? "other"} className={SELECT_CLASS}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <legend className="mb-1 text-sm font-medium">Per 100 g</legend>
        {(["kcal", "protein", "fat", "carbs", "fiber"] as const).map((key) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`food-${key}-${id}`} className="capitalize">
              {key === "kcal" ? "kcal" : `${key}, g`}
            </Label>
            <Input
              id={`food-${key}-${id}`}
              name={key}
              inputMode="decimal"
              required={key !== "fiber"}
              defaultValue={food ? String(Number(food[key])) : ""}
            />
          </div>
        ))}
      </fieldset>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {food?.id ? "Save" : "Add food"}
        </Button>
        {onDone && food?.id ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function FoodRowActions({ food }: { food: FoodValues & { id: string } }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={() => setEditing((v) => !v)}>
          Edit
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete "${food.name}"?`)) void run(() => send(`/api/meals/foods/${food.id}`, "DELETE"));
          }}
        >
          Delete
        </Button>
      </div>
      <ErrorText error={error} />
      {editing ? (
        <div className="rounded-xl border border-border p-3">
          <FoodForm food={food} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}

export function TargetsForm({
  memberId,
  label,
  target,
}: {
  memberId: string;
  label: string;
  target: { kcal: number | null; protein_min: number | null; protein_max: number | null; fat_min: number | null; fat_max: number | null } | undefined;
}) {
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Math.round(Number(v)));
  return (
    <form
      className="card-soft grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        const form = new FormData(e.currentTarget);
        void run(
          () =>
            send("/api/meals/targets", "PUT", {
              memberId,
              kcal: num(form.get("kcal")),
              proteinMin: num(form.get("proteinMin")),
              proteinMax: num(form.get("proteinMax")),
              fatMin: num(form.get("fatMin")),
              fatMax: num(form.get("fatMax")),
            }),
          () => setSaved(true),
        );
      }}
    >
      <h3 className="font-semibold">{label}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["kcal", "kcal / day", target?.kcal],
          ["proteinMin", "Protein min, g", target?.protein_min],
          ["proteinMax", "Protein max, g", target?.protein_max],
          ["fatMin", "Fat min, g", target?.fat_min],
          ["fatMax", "Fat max, g", target?.fat_max],
        ].map(([name, text, value]) => (
          <div key={name as string} className="grid gap-1.5">
            <Label htmlFor={`${name}-${memberId}`}>{text}</Label>
            <Input id={`${name}-${memberId}`} name={name as string} type="number" min={0} defaultValue={value ?? ""} />
          </div>
        ))}
      </div>
      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          Save targets
        </Button>
        {saved ? <span className="text-sm text-muted-foreground">Saved ♥</span> : null}
      </div>
    </form>
  );
}

export function ShoppingActions({ text }: { text: string }) {
  const { busy, error, run } = useAction();
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || added}
          onClick={() => void run(() => send("/api/meals/shopping-task", "POST"), () => setAdded(true))}
        >
          {added ? "Added to To-do ♥" : "Add to To-do"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy list"}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

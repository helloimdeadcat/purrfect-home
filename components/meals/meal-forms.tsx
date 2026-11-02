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

const NUTRIENT_LABEL = {
  kcal: "ккал",
  protein: "белки, г",
  fat: "жиры, г",
  carbs: "углеводы, г",
  fiber: "клетчатка, г",
} as const;

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
  return field ?? data.error ?? "Не получилось сохранить";
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
        <h2 className="font-semibold">Загрузи свой план на 7 дней</h2>
        <p className="text-sm text-muted-foreground">
          28 блюд с граммовками для каждого из вас, дневные цели по калориям,
          белкам и жирам, правила взвешивания и советы по готовке — всё можно потом изменить.
        </p>
      </div>
      {people.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Сначала пригласи партнёра на странице «Семья» — в плане порции на двоих.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-husband">Столбец «Муж» — это</Label>
              <select id="plan-husband" value={husband} onChange={(e) => setHusband(e.target.value)} className={SELECT_CLASS}>
                {people.map((p) => (
                  <option key={p.memberId} value={p.memberId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-wife">Столбец «Жена» — это</Label>
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
              Добавить и привычки из плана: вода (2,25 л / 1,75 л), шаги
              (от 2 500 в день) и силовые по Пн и Чт.
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
            {busy ? "Загружаю…" : "Загрузить план на 7 дней"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => send("/api/meals/plan", "POST"))}>
          Начать с пустого плана
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
        <Label htmlFor={`slot-${weekday}`}>Приём пищи</Label>
        <select id={`slot-${weekday}`} name="slot" className={SELECT_CLASS} defaultValue="dinner">
          {SLOT_ORDER.map((slot) => (
            <option key={slot} value={slot}>
              {SLOT_LABEL[slot]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`title-${weekday}`}>Блюдо</Label>
        <Input id={`title-${weekday}`} name="title" required maxLength={160} placeholder="Курица с гречкой…" />
      </div>
      <Button type="submit" disabled={busy}>
        Добавить блюдо
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
        <p className="text-sm whitespace-pre-line text-muted-foreground">{notes || "Заметок пока нет."}</p>
        <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => setEditing(true)}>
          Изменить заметки
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
          Сохранить
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Отмена
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
          <Label htmlFor={`food-name-${id}`}>Название</Label>
          <Input id={`food-name-${id}`} name="name" required maxLength={80} defaultValue={food?.name} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`food-weigh-${id}`}>Как взвешивать</Label>
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
          <Label htmlFor={`food-cat-${id}`}>Отдел в магазине</Label>
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
        <legend className="mb-1 text-sm font-medium">На 100 г</legend>
        {(["kcal", "protein", "fat", "carbs", "fiber"] as const).map((key) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`food-${key}-${id}`} >
              {NUTRIENT_LABEL[key]}
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
          {food?.id ? "Сохранить" : "Добавить продукт"}
        </Button>
        {onDone && food?.id ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Отмена
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
          Изменить
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Удалить «${food.name}»?`)) void run(() => send(`/api/meals/foods/${food.id}`, "DELETE"));
          }}
        >
          Удалить
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
          ["kcal", "ккал / день", target?.kcal],
          ["proteinMin", "Белки мин., г", target?.protein_min],
          ["proteinMax", "Белки макс., г", target?.protein_max],
          ["fatMin", "Жиры мин., г", target?.fat_min],
          ["fatMax", "Жиры макс., г", target?.fat_max],
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
          Сохранить цели
        </Button>
        {saved ? <span className="text-sm text-muted-foreground">Сохранено ♥</span> : null}
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
          {added ? "Добавлено в дела ♥" : "Добавить в дела"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? "Скопировано" : "Скопировать список"}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

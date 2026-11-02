"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPE_LABELS: Record<Category["type"], string> = {
  expense: "Расход",
  income: "Доход",
  both: "Доход и расход",
};

type Category = {
  id: string;
  name: string;
  type: "expense" | "income" | "both";
  is_active: boolean;
  color: string | null;
};

type Props = {
  categories: Category[];
  canManage: boolean;
  canRemove: boolean;
};

export function CategoriesSettings({
  categories,
  canManage,
  canRemove,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<"expense" | "income" | "both">("expense");

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setError(null);
    setPending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          type,
          color: String(form.get("color") ?? "") || null,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось создать категорию");
        return;
      }
      formEl.reset();
      setType("expense");
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось сохранить");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!canRemove) return;
    if (!window.confirm(`Удалить или архивировать «${name}»?`)) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = (await response.json()) as {
        error?: string;
        archived?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? "Не получилось удалить");
        return;
      }
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 card-soft p-4">
      <div>
        <h2 className="font-medium">Категории</h2>
        <p className="text-sm text-muted-foreground">
          Категории, которые уже где-то используются, не удаляются, а уходят в
          архив — так история остаётся целой.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Категорий пока нет.</p>
      ) : (
        <ul className="grid gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPE_LABELS[category.type] ?? category.type}
                  {category.is_active ? "" : " · в архиве"}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {!category.is_active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void patch(category.id, { isActive: true })}
                    >
                      Восстановить
                    </Button>
                  ) : canRemove ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void remove(category.id, category.name)}
                    >
                      В архив / удалить
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={onCreate} className="grid gap-3 border-t border-border pt-3">
          <p className="text-sm font-medium">Новая категория</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="cat-name">Название</Label>
              <Input id="cat-name" name="name" required maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-type">Тип</Label>
              <select
                id="cat-type"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as typeof type)
                }
              >
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
                <option value="both">Доход и расход</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-color">Цвет</Label>
              <Input id="cat-color" name="color" placeholder="#7FCBB0" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Сохраняем…" : "Добавить категорию"}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ShoppingItem } from "@/services/shopping-service";

type Props = {
  items: ShoppingItem[];
  canEdit: boolean;
};

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? "Что-то пошло не так";
  } catch {
    return "Что-то пошло не так";
  }
}

export function ShoppingList({ items, canEdit }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const open = items.filter((item) => !item.is_done);
  const done = items.filter((item) => item.is_done);

  async function run(path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) {
        setError(await readError(response));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Ошибка сети");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const ok = await run("/api/shopping", {
      method: "POST",
      body: JSON.stringify({ title: trimmed }),
    });
    if (ok) setTitle("");
  }

  return (
    <div className="grid gap-6">
      {canEdit ? (
        <div className="grid gap-1.5">
          <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Молоко, хлеб, кошачий корм…"
              maxLength={2000}
              disabled={busy}
              className="sm:flex-1"
              aria-describedby="shopping-split-hint"
            />
            <Button type="submit" disabled={busy || !title.trim()}>
              Добавить
            </Button>
          </form>
          <p id="shopping-split-hint" className="text-xs text-muted-foreground">
            Несколько позиций — через запятую: каждая станет отдельным пунктом.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run("/api/shopping/from-meals", { method: "POST" })}
            >
              Из плана питания
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || done.length === 0}
              onClick={() => void run("/api/shopping/clear-done", { method: "POST" })}
            >
              Убрать купленное
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={open.length === 0}
          onClick={() => {
            const text = open
              .map((item) => `☐ ${item.title}${item.note ? ` (${item.note})` : ""}`)
              .join("\n");
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Список пока пуст. Добавь позицию или подтяни продукты из плана питания.
        </p>
      ) : (
        <div className="grid gap-5">
          <Section
            title="Купить"
            empty="Всё куплено ♥"
            items={open}
            canEdit={canEdit}
            busy={busy}
            onToggle={(id, isDone) =>
              void run(`/api/shopping/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isDone }),
              })
            }
            onDelete={(id) =>
              void run(`/api/shopping/${id}`, { method: "DELETE" })
            }
          />
          {done.length > 0 ? (
            <Section
              title="Куплено"
              empty=""
              items={done}
              canEdit={canEdit}
              busy={busy}
              onToggle={(id, isDone) =>
                void run(`/api/shopping/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ isDone }),
                })
              }
              onDelete={(id) =>
                void run(`/api/shopping/${id}`, { method: "DELETE" })
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  items,
  canEdit,
  busy,
  onToggle,
  onDelete,
}: {
  title: string;
  empty: string;
  items: ShoppingItem[];
  canEdit: boolean;
  busy: boolean;
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="font-medium">
        {title}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 card-soft px-3 py-2.5"
            >
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--primary)]"
                checked={item.is_done}
                disabled={!canEdit || busy}
                aria-label={item.is_done ? "Вернуть в список" : "Отметить купленным"}
                onChange={() => onToggle(item.id, !item.is_done)}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-medium",
                    item.is_done && "text-muted-foreground line-through",
                  )}
                >
                  {item.title}
                </p>
                {item.note ? (
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                ) : null}
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => onDelete(item.id)}
                >
                  Удалить
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

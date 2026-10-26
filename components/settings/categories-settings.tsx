"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        setError(data.error ?? "Failed to create category");
        return;
      }
      formEl.reset();
      setType("expense");
      router.refresh();
    } catch {
      setError("Network error");
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
        setError(data.error ?? "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!canRemove) return;
    if (!window.confirm(`Remove or archive “${name}”?`)) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = (await response.json()) as {
        error?: string;
        archived?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? "Remove failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 card-soft p-4">
      <div>
        <h2 className="font-medium">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Used categories are archived instead of deleted so history stays
          intact.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="grid gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="font-medium">{category.name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {category.type}
                  {category.is_active ? "" : " · archived"}
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
                      Restore
                    </Button>
                  ) : canRemove ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void remove(category.id, category.name)}
                    >
                      Archive / delete
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
          <p className="text-sm font-medium">New category</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" name="name" required maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-type">Type</Label>
              <select
                id="cat-type"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as typeof type)
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-color">Color</Label>
              <Input id="cat-color" name="color" placeholder="#7FCBB0" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add category"}
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

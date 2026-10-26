"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tag = {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
};

type Props = {
  tags: Tag[];
  canManage: boolean;
  canRemove: boolean;
};

export function TagsSettings({ tags, canManage, canRemove }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setError(null);
    setPending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          color: String(form.get("color") ?? "") || null,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to create tag");
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

  async function saveRename(id: string) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Rename failed");
        return;
      }
      setEditingId(null);
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
      const response = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
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

  async function restore(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Restore failed");
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
        <h2 className="font-medium">Tags</h2>
        <p className="text-sm text-muted-foreground">
          Tags stay linked to past transactions when archived.
        </p>
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <ul className="grid gap-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              {editingId === tag.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={40}
                    className="w-40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => void saveRename(tag.id)}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="font-medium">{tag.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tag.is_active ? "active" : "archived"}
                  </p>
                </div>
              )}
              {canManage && editingId !== tag.id ? (
                <div className="flex flex-wrap gap-2">
                  {tag.is_active ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditName(tag.name);
                        }}
                      >
                        Rename
                      </Button>
                      {canRemove ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => void remove(tag.id, tag.name)}
                        >
                          Archive / delete
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void restore(tag.id)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={onCreate} className="grid gap-3 border-t border-border pt-3">
          <p className="text-sm font-medium">New tag</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input id="tag-name" name="name" required maxLength={40} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tag-color">Color</Label>
              <Input id="tag-color" name="color" placeholder="#E8679A" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add tag"}
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

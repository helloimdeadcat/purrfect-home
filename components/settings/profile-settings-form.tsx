"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  currency: string;
  email: string;
};

export function ProfileSettingsForm({
  firstName,
  lastName,
  displayName,
  currency,
  email,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(form.get("firstName") ?? ""),
          lastName: String(form.get("lastName") ?? ""),
          displayName: String(form.get("displayName") ?? ""),
          currency: String(form.get("currency") ?? ""),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось сохранить профиль");
        return;
      }
      setSuccess("Профиль сохранён 🐾");
      router.refresh();
    } catch {
      setError("Ошибка сети");
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
        <h2 className="font-medium">Профиль</h2>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">Имя</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={firstName ?? ""}
            maxLength={80}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Фамилия</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={lastName ?? ""}
            maxLength={80}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="displayName">Как тебя называть в семье</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={displayName ?? ""}
            maxLength={120}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Любимая валюта</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={currency}
            maxLength={3}
            required
          />
          <p className="text-xs text-muted-foreground">
            Только личная настройка — балансы семьи не пересчитываются.
          </p>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}

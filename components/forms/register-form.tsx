"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterResponse = {
  ok?: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
  message?: string;
  redirectTo?: string;
};

type Props = {
  inviteToken?: string;
  invitedEmail?: string;
};

export function RegisterForm({ inviteToken, invitedEmail }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      householdName: String(form.get("householdName") ?? "Наша семья"),
      currency: String(form.get("currency") ?? "EUR"),
      inviteToken: inviteToken || undefined,
    };

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as RegisterResponse;

      if (!response.ok) {
        setError(data.error ?? "Не получилось зарегистрироваться");
        return;
      }

      if (data.needsEmailConfirmation) {
        setInfo(
          data.message ??
            "Проверь почту, подтверди аккаунт и войди.",
        );
        return;
      }

      router.push(data.redirectTo ?? "/app/dashboard");
      router.refresh();
    } catch {
      setError("Ошибка сети. Попробуй ещё раз.");
    } finally {
      setPending(false);
    }
  }

  const loginHref = inviteToken
    ? `/login?invite=${encodeURIComponent(inviteToken)}`
    : "/login";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {inviteToken ? (
        <p className="text-sm text-muted-foreground">
          Зарегистрируйся на почту, на которую пришло приглашение, а потом
          прими его на следующем экране.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">Имя</Label>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Фамилия</Label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={invitedEmail ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {!inviteToken ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="householdName">Название семьи</Label>
            <Input
              id="householdName"
              name="householdName"
              defaultValue="Наша семья"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="currency">Валюта</Label>
            <Input
              id="currency"
              name="currency"
              defaultValue="EUR"
              maxLength={3}
              required
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="householdName" value="Моя семья" />
          <input type="hidden" name="currency" value="EUR" />
        </>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-muted-foreground" role="status">
          {info}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link href={loginHref} className="underline underline-offset-4">
          Войти
        </Link>
      </p>
    </form>
  );
}

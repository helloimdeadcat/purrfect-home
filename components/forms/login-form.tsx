"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

type Props = {
  inviteToken?: string;
};

export function LoginForm({ inviteToken }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      inviteToken: inviteToken || undefined,
    };

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(data.error ?? "Не получилось войти");
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

  const registerHref = inviteToken
    ? `/register?invite=${encodeURIComponent(inviteToken)}`
    : "/register";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {inviteToken ? (
        <p className="text-sm text-muted-foreground">
          После входа ты вернёшься к приглашению, чтобы принять его.
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email">Почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Входим…" : "Войти"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Ещё нет аккаунта?{" "}
        <Link href={registerHref} className="underline underline-offset-4">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}

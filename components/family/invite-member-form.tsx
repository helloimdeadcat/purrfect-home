"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateInviteResponse = {
  error?: string;
  inviteUrl?: string;
  deliveryMode?: string;
};

function readErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Ошибка сети — проверь подключение и попробуй ещё раз";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Что-то пошло не так при создании приглашения";
}

export function InviteMemberForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    setPending(true);

    // Capture before any await — React clears event.currentTarget afterwards.
    const formEl = event.currentTarget;
    const email = String(new FormData(formEl).get("email") ?? "");

    let created = false;

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "member" }),
      });

      let data: CreateInviteResponse;
      try {
        data = (await response.json()) as CreateInviteResponse;
      } catch {
        setError(
          response.ok
            ? "Приглашение, возможно, создано, но ответ не удалось прочитать. Обнови страницу."
            : "Сервер вернул некорректный ответ",
        );
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Не получилось создать приглашение");
        return;
      }

      created = true;
      setInviteUrl(data.inviteUrl ?? null);
    } catch (error) {
      // Do not log invite tokens or request bodies.
      console.error("[invite] create request failed", {
        message: readErrorMessage(error),
      });
      setError(readErrorMessage(error));
      return;
    } finally {
      setPending(false);
    }

    // Post-success cleanup must not surface as a create failure.
    if (created) {
      try {
        formEl.reset();
      } catch {
        // Detached form after refresh — ignore.
      }
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 card-soft p-4"
    >
      <h2 className="font-medium">Пригласить участника</h2>
      <p className="text-sm text-muted-foreground">
        Приглашённый всегда получает роль «Участник». Отправка писем пока не
        настроена — ссылку-приглашение увидишь только ты, сразу после создания.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Почта</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="partner@example.com"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Создаём…" : "Пригласить"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {inviteUrl ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm" role="status">
          <p className="mb-1 font-medium">Ссылка-приглашение (скопируй сейчас)</p>
          <p className="break-all font-mono text-xs">{inviteUrl}</p>
          <p className="mt-2 text-muted-foreground">
            В ссылке одноразовый токен. Он не хранится в базе и больше не
            будет показан.
          </p>
        </div>
      ) : null}
    </form>
  );
}

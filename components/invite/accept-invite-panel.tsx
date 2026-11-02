"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LOCALE } from "@/lib/locale";

const STATUS_LABELS: Record<string, string> = {
  pending: "ещё не принято",
  accepted: "уже принято",
  revoked: "отозвано",
  expired: "просрочено",
  invalid: "недействительно",
};

type Preview = {
  isValid: boolean;
  householdName: string | null;
  invitedEmail: string | null;
  expiresAt: string | null;
  status: string;
};

type Props = {
  token: string;
  isAuthenticated: boolean;
  userEmail: string | null;
};

export function AcceptInvitePanel({
  token,
  isAuthenticated,
  userEmail,
}: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/invitations/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json()) as {
          error?: string;
          preview?: Preview;
        };
        if (cancelled) return;
        if (!response.ok || !data.preview) {
          setLoadError(data.error ?? "Не получилось загрузить приглашение");
          return;
        }
        setPreview(data.preview);
      } catch {
        if (!cancelled) setLoadError("Ошибка сети");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onAccept() {
    setAcceptError(null);
    setPending(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok) {
        setAcceptError(data.error ?? "Не получилось принять приглашение");
        return;
      }
      router.push(data.redirectTo ?? "/app/dashboard");
      router.refresh();
    } catch {
      setAcceptError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  const loginHref = `/login?invite=${encodeURIComponent(token)}`;
  const registerHref = `/register?invite=${encodeURIComponent(token)}`;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загружаем приглашение…</p>;
  }

  if (loadError || !preview) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? "Приглашение недействительно"}
      </p>
    );
  }

  if (!preview.isValid) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-destructive" role="alert">
          Это приглашение{" "}
          {STATUS_LABELS[preview.status || "invalid"] ?? preview.status}.
        </p>
        {preview.householdName ? (
          <p className="text-muted-foreground">
            Семья: {preview.householdName}
          </p>
        ) : null}
        <Link href="/login" className="underline underline-offset-4">
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <p>
          Тебя приглашают в семью{" "}
          <span className="font-medium">
            {preview.householdName ?? "без названия"}
          </span>
          .
        </p>
        {preview.invitedEmail ? (
          <p className="text-muted-foreground">
            Приглашение для {preview.invitedEmail}
          </p>
        ) : null}
        {preview.expiresAt ? (
          <p className="text-muted-foreground">
            Действует до {new Date(preview.expiresAt).toLocaleString(LOCALE)}
          </p>
        ) : null}
      </div>

      {isAuthenticated ? (
        <div className="grid gap-2">
          {userEmail &&
          preview.invitedEmail &&
          userEmail.toLowerCase() !== preview.invitedEmail.toLowerCase() ? (
            <p className="text-sm text-destructive" role="alert">
              Сейчас ты в аккаунте {userEmail}, а приглашение для{" "}
              {preview.invitedEmail}. Выйди и зайди под приглашённым аккаунтом.
            </p>
          ) : (
            <Button type="button" disabled={pending} onClick={onAccept}>
              {pending ? "Присоединяемся…" : "Принять приглашение"}
            </Button>
          )}
          {acceptError ? (
            <p className="text-sm text-destructive" role="alert">
              {acceptError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            Войди или зарегистрируйся на почту из приглашения, а потом прими его.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={loginHref} className="underline underline-offset-4">
              Войти
            </Link>
            <Link href={registerHref} className="underline underline-offset-4">
              Зарегистрироваться
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** VAPID public key; null when push is not configured on the server. */
  publicKey: string | null;
};

type Status =
  | "checking"
  | "unsupported"
  | "ios-needs-install"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) {
    // In production ServiceWorkerRegistration already did this; in dev the
    // worker is only registered once the user opts into push.
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
  return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription: PushSubscription): Promise<string | null> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Не получилось включить уведомления";
}

export function PushNotificationsSettings({ publicKey }: Props) {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ios, setIos] = useState(false);

  const refresh = useCallback(async () => {
    const onIos = isIos();
    setIos(onIos);
    if (!pushSupported()) {
      setStatus(onIos && !isStandalone() ? "ios-needs-install" : "unsupported");
      return;
    }
    if (!publicKey) {
      setStatus("not-configured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription && Notification.permission === "granted") {
      // Re-sync quietly: the server may have pruned an expired row.
      await saveSubscription(subscription).catch(() => null);
      setStatus("on");
    } else {
      setStatus("off");
    }
  }, [publicKey]);

  useEffect(() => {
    // Browser-only checks (permission, worker) must run after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => setStatus("unsupported"));
  }, [refresh]);

  async function enable() {
    if (!publicKey) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        if (permission !== "denied") setError("Нужно разрешить уведомления в окне браузера");
        return;
      }
      const registration = await getRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const saveError = await saveSubscription(subscription);
      if (saveError) {
        await subscription.unsubscribe().catch(() => false);
        setError(saveError);
        return;
      }
      setStatus("on");
      setMessage("Готово! Нажми «Проверить», чтобы получить тестовое уведомление.");
    } catch {
      setError("Не получилось включить уведомления на этом устройстве");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage("Уведомления на этом устройстве выключены.");
    } catch {
      setError("Не получилось выключить уведомления");
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не получилось отправить проверку");
        return;
      }
      setMessage("Отправили! Уведомление должно прийти через пару секунд.");
    } catch {
      setError("Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  const on = status === "on";
  const toggleable = status === "on" || status === "off";

  return (
    <section className="grid gap-3 card-soft p-4" aria-labelledby="push-settings-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="push-settings-title" className="font-medium">
            Уведомления на телефоне
          </h2>
          <p className="text-sm text-muted-foreground">
            Пуш, когда партнёр назначает дело, отмечает платёж и т.п. Включается
            отдельно на каждом устройстве.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="push-settings-title"
          disabled={!toggleable || pending}
          onClick={on ? disable : enable}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 ${
            on ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {status === "checking" ? (
        <p className="text-sm text-muted-foreground">Проверяем устройство…</p>
      ) : null}
      {status === "unsupported" ? (
        <p className="text-sm text-muted-foreground">
          Этот браузер не умеет получать push-уведомления. Попробуй Chrome,
          Edge, Firefox или Safari.
        </p>
      ) : null}
      {status === "not-configured" ? (
        <p className="text-sm text-muted-foreground">
          Push-уведомления пока не настроены на сервере.
        </p>
      ) : null}
      {status === "denied" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Уведомления для сайта запрещены. Разреши их в настройках браузера
          (значок замка у адреса → «Уведомления») или в настройках телефона для
          приложения, а потом обнови страницу.
        </p>
      ) : null}
      {status === "ios-needs-install" || (ios && status !== "on") ? (
        <p className="text-sm text-muted-foreground">
          На iPhone уведомления работают, только если приложение добавлено на
          главный экран (iOS 16.4+): «Поделиться» → «На экран „Домой“», затем
          открой его оттуда.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      {on ? (
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={sendTest}>
            {pending ? "Минутку…" : "Проверить"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

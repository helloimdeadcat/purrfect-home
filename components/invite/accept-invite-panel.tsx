"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

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
          setLoadError(data.error ?? "Could not load invitation");
          return;
        }
        setPreview(data.preview);
      } catch {
        if (!cancelled) setLoadError("Network error");
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
        setAcceptError(data.error ?? "Could not accept invitation");
        return;
      }
      router.push(data.redirectTo ?? "/app/dashboard");
      router.refresh();
    } catch {
      setAcceptError("Network error");
    } finally {
      setPending(false);
    }
  }

  const loginHref = `/login?invite=${encodeURIComponent(token)}`;
  const registerHref = `/register?invite=${encodeURIComponent(token)}`;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading invitation…</p>;
  }

  if (loadError || !preview) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? "Invalid invitation"}
      </p>
    );
  }

  if (!preview.isValid) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-destructive" role="alert">
          This invitation is {preview.status || "invalid"}.
        </p>
        {preview.householdName ? (
          <p className="text-muted-foreground">
            Household: {preview.householdName}
          </p>
        ) : null}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <p>
          You are invited to join{" "}
          <span className="font-medium">
            {preview.householdName ?? "a household"}
          </span>
          .
        </p>
        {preview.invitedEmail ? (
          <p className="text-muted-foreground">
            Invitation for {preview.invitedEmail}
          </p>
        ) : null}
        {preview.expiresAt ? (
          <p className="text-muted-foreground">
            Expires {new Date(preview.expiresAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {isAuthenticated ? (
        <div className="grid gap-2">
          {userEmail &&
          preview.invitedEmail &&
          userEmail.toLowerCase() !== preview.invitedEmail.toLowerCase() ? (
            <p className="text-sm text-destructive" role="alert">
              Signed in as {userEmail}, but this invite is for{" "}
              {preview.invitedEmail}. Sign out and use the invited account.
            </p>
          ) : (
            <Button type="button" disabled={pending} onClick={onAccept}>
              {pending ? "Joining…" : "Accept invitation"}
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
            Sign in or create an account with the invited email, then accept.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={loginHref} className="underline underline-offset-4">
              Sign in
            </Link>
            <Link href={registerHref} className="underline underline-offset-4">
              Create account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

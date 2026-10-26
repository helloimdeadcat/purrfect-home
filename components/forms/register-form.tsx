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
      householdName: String(form.get("householdName") ?? "Our Family"),
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
        setError(data.error ?? "Registration failed");
        return;
      }

      if (data.needsEmailConfirmation) {
        setInfo(
          data.message ??
            "Check your email to confirm your account, then sign in.",
        );
        return;
      }

      router.push(data.redirectTo ?? "/app/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
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
          Register with the invited email, then accept the invitation on the
          next screen.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
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
        <Label htmlFor="password">Password</Label>
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
            <Label htmlFor="householdName">Household name</Label>
            <Input
              id="householdName"
              name="householdName"
              defaultValue="Our Family"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
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
          <input type="hidden" name="householdName" value="My Household" />
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
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={loginHref} className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

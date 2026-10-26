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
    return "Network error — check your connection and try again";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong while creating the invitation";
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
            ? "Invitation may have been created, but the response was unreadable. Refresh the page."
            : "Server returned an invalid response",
        );
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Failed to create invitation");
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
      <h2 className="font-medium">Invite a member</h2>
      <p className="text-sm text-muted-foreground">
        Invitations always grant the member role. Email delivery is not
        configured yet — the invite link is shown only to you after creating
        it.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
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
          {pending ? "Creating…" : "Create invite"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {inviteUrl ? (
        <div className="rounded-lg bg-muted/50 p-3 text-sm" role="status">
          <p className="mb-1 font-medium">Dev invite link (copy now)</p>
          <p className="break-all font-mono text-xs">{inviteUrl}</p>
          <p className="mt-2 text-muted-foreground">
            This link contains a one-time token. It is not stored in the
            database and will not be shown again.
          </p>
        </div>
      ) : null}
    </form>
  );
}

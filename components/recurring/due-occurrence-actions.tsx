"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asMoney, displayMoney } from "@/lib/calculations/money";
import type { DueOccurrenceView } from "@/services/recurring-service";

type Props = {
  occurrence: DueOccurrenceView;
};

export function DueOccurrenceActions({ occurrence }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState(() =>
    asMoney(occurrence.amount ?? occurrence.templateAmount),
  );

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(
        `/api/recurring/occurrences/${occurrence.id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: String(amount).trim() }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const fieldMessage = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : null;
        setError(fieldMessage ?? data.error ?? "Confirm failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function skip() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(
        `/api/recurring/occurrences/${occurrence.id}/skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const fieldMessage = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : null;
        setError(fieldMessage ?? data.error ?? "Skip failed");
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
    <div className="grid gap-2 card-soft px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{occurrence.paymentName}</p>
          <p className="text-sm text-muted-foreground capitalize">
            {occurrence.effectiveStatus} · {occurrence.scheduled_date} ·{" "}
            {occurrence.paymentType}
          </p>
        </div>
        <p className="font-medium tabular-nums">
          {displayMoney(
            occurrence.amount ?? occurrence.templateAmount,
            occurrence.currency,
          )}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1">
          <Label htmlFor={`amt-${occurrence.id}`}>Confirm amount</Label>
          <Input
            id={`amt-${occurrence.id}`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => void confirm()}
        >
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void skip()}
        >
          Skip
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { displayMoney } from "@/lib/calculations/money";
import type { GoalOperationRow } from "@/services/goal-service";

type Props = {
  goalId: string;
  currency: string;
};

const TYPE_LABEL: Record<GoalOperationRow["type"], string> = {
  initial: "Starting balance",
  deposit: "Deposit",
  withdraw: "Withdraw",
  adjust: "Adjustment",
};

export function GoalHistory({ goalId, currency }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<GoalOperationRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/goals/${goalId}/operations`);
        const data = (await response.json()) as {
          error?: string;
          operations?: GoalOperationRow[];
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "Failed to load history");
          return;
        }
        setOperations(data.operations ?? []);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, goalId]);

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide history" : "Show history"}
      </Button>

      {open ? (
        <div className="grid gap-2 rounded-lg border border-border p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error && operations?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operations yet.</p>
          ) : null}
          {!loading &&
            operations?.map((op) => (
              <div
                key={op.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{TYPE_LABEL[op.type]}</p>
                  <p className="text-muted-foreground">
                    {op.operation_date}
                    {op.note ? ` · ${op.note}` : ""}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p>
                    {op.type === "withdraw" ? "−" : op.type === "adjust" ? "=" : "+"}
                    {displayMoney(op.amount, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    bal {displayMoney(op.balance_after, currency)}
                  </p>
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

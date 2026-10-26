"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditGoalForm } from "@/components/goals/edit-goal-form";
import { GoalOperationForm } from "@/components/goals/goal-operation-form";
import { Button } from "@/components/ui/button";
import type { GoalWithProgress } from "@/services/goal-service";

type Props = {
  goal: GoalWithProgress;
  canManage: boolean;
  canDelete: boolean;
};

type Panel = "deposit" | "withdraw" | "adjust" | "edit" | null;

export function GoalActions({ goal, canManage, canDelete }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        `Delete goal “${goal.name}”? This also removes its operation history.`,
      )
    ) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/goals/${goal.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (!canManage) {
    return null;
  }

  const archived = goal.is_archived;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <>
            <Button
              type="button"
              size="sm"
              variant={panel === "deposit" ? "default" : "outline"}
              onClick={() => setPanel(panel === "deposit" ? null : "deposit")}
            >
              Add funds
            </Button>
            <Button
              type="button"
              size="sm"
              variant={panel === "withdraw" ? "default" : "outline"}
              onClick={() => setPanel(panel === "withdraw" ? null : "withdraw")}
            >
              Withdraw
            </Button>
            <Button
              type="button"
              size="sm"
              variant={panel === "adjust" ? "default" : "outline"}
              onClick={() => setPanel(panel === "adjust" ? null : "adjust")}
            >
              Adjust
            </Button>
            <Button
              type="button"
              size="sm"
              variant={panel === "edit" ? "default" : "outline"}
              onClick={() => setPanel(panel === "edit" ? null : "edit")}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void patch({ isArchived: true })}
            >
              Archive
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void patch({ isArchived: false })}
          >
            Restore
          </Button>
        )}
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => void onDelete()}
          >
            Delete
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {panel === "deposit" && !archived ? (
        <GoalOperationForm
          goalId={goal.id}
          currency={goal.currency}
          mode="deposit"
          onDone={() => setPanel(null)}
        />
      ) : null}
      {panel === "withdraw" && !archived ? (
        <GoalOperationForm
          goalId={goal.id}
          currency={goal.currency}
          mode="withdraw"
          onDone={() => setPanel(null)}
        />
      ) : null}
      {panel === "adjust" && !archived ? (
        <GoalOperationForm
          goalId={goal.id}
          currency={goal.currency}
          mode="adjust"
          onDone={() => setPanel(null)}
        />
      ) : null}
      {panel === "edit" && !archived ? (
        <EditGoalForm
          goalId={goal.id}
          name={goal.name}
          targetAmount={goal.target_amount}
          description={goal.description}
          targetDate={goal.target_date}
          currency={goal.currency}
          onDone={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

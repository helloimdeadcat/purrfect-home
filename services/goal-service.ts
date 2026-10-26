import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import {
  computeGoalProgress,
  type GoalProgress,
} from "@/lib/calculations/goal-progress";
import {
  compareMoney,
  formatMoney,
  parseMoney,
} from "@/lib/calculations/money";
import type {
  CreateGoalInput,
  GoalOperationInput,
  UpdateGoalInput,
} from "@/lib/validations/goal";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type GoalOperationRow =
  Database["public"]["Tables"]["goal_operations"]["Row"];

export type GoalWithProgress = GoalRow & {
  progress: GoalProgress;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function withProgress(goal: GoalRow): GoalWithProgress {
  return {
    ...goal,
    progress: computeGoalProgress(goal.target_amount, goal.current_amount, {
      isArchived: goal.is_archived,
      isCompleted: goal.is_completed,
    }),
  };
}

export async function listGoals(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { includeArchived?: boolean },
): Promise<{ data: GoalWithProgress[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("goals")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("is_archived", { ascending: true })
    .order("is_completed", { ascending: true })
    .order("created_at", { ascending: false });

  if (!options?.includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return {
    data: (data ?? []).map(withProgress),
    error: null,
  };
}

export async function getGoal(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
): Promise<{ data: GoalWithProgress | null; error: ServiceError | null }> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }
  if (!data) {
    return { data: null, error: err("NOT_FOUND", "Goal not found") };
  }

  return { data: withProgress(data), error: null };
}

export async function listGoalOperations(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
): Promise<{ data: GoalOperationRow[] | null; error: ServiceError | null }> {
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (goalError) {
    return { data: null, error: err("DB", goalError.message) };
  }
  if (!goal) {
    return { data: null, error: err("NOT_FOUND", "Goal not found") };
  }

  const { data, error } = await supabase
    .from("goal_operations")
    .select("*")
    .eq("goal_id", goalId)
    .eq("household_id", ctx.householdId)
    .order("operation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return { data: data ?? [], error: null };
}

export async function createGoal(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateGoalInput,
): Promise<{ data: GoalWithProgress | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Viewers cannot create goals"),
    };
  }

  const currency = (input.currency ?? ctx.currency).toUpperCase();
  const initial = input.initialAmount ?? ("0.00" as Money);

  if (compareMoney(initial, input.targetAmount) > 0) {
    // Allowed (overfunded at start) but mark completed
  }

  const isCompleted = compareMoney(initial, input.targetAmount) >= 0;

  const { data, error } = await supabase
    .from("goals")
    .insert({
      household_id: ctx.householdId,
      name: input.name,
      description: input.description ?? null,
      target_amount: input.targetAmount,
      current_amount: initial,
      currency,
      target_date: input.targetDate ?? null,
      is_completed: isCompleted,
      is_archived: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to create goal"),
    };
  }

  // The "Starting balance" history entry is written by the
  // goals_record_initial_operation trigger (clients cannot insert history).
  return { data: withProgress(data), error: null };
}

export async function updateGoal(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
  input: UpdateGoalInput,
): Promise<{ data: GoalWithProgress | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Viewers cannot update goals"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Goal not found") };
  }

  const patch: Database["public"]["Tables"]["goals"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.targetAmount !== undefined) patch.target_amount = input.targetAmount;
  if (input.description !== undefined) patch.description = input.description;
  if (input.targetDate !== undefined) patch.target_date = input.targetDate;
  if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
  if (input.isCompleted !== undefined) patch.is_completed = input.isCompleted;

  // Recalculate completion when target changes
  if (input.targetAmount !== undefined && input.isCompleted === undefined) {
    patch.is_completed =
      compareMoney(existing.current_amount, input.targetAmount) >= 0;
  }

  const { data, error } = await supabase
    .from("goals")
    .update(patch)
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Failed to update goal"),
    };
  }

  return { data: withProgress(data), error: null };
}

export async function applyGoalOperation(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
  input: GoalOperationInput,
): Promise<{
  data: { goal: GoalWithProgress; operationId: string } | null;
  error: ServiceError | null;
}> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Viewers cannot modify goal balances"),
    };
  }

  // Ensure goal belongs to this household before RPC (RPC also checks role)
  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("id, is_archived, household_id")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Goal not found") };
  }
  if (existing.is_archived) {
    return {
      data: null,
      error: err("VALIDATION", "Cannot modify an archived goal"),
    };
  }

  if (input.type !== "adjust" && input.amount === "0.00") {
    return {
      data: null,
      error: err("VALIDATION", "Amount must be greater than zero"),
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "apply_goal_operation",
    {
      p_goal_id: goalId,
      p_type: input.type,
      p_amount: input.amount,
      p_note: input.note ?? null,
      p_operation_date: input.operationDate ?? null,
    },
  );

  if (rpcError) {
    const message = rpcError.message || "Could not apply operation";
    if (
      message.includes("Insufficient") ||
      message.includes("Invalid") ||
      message.includes("archived") ||
      message.includes("greater than zero") ||
      message.includes("non-negative") ||
      message.includes("Forbidden") ||
      message.includes("Not authenticated")
    ) {
      const code = message.includes("Forbidden") ? "FORBIDDEN" : "VALIDATION";
      return {
        data: null,
        error: err(code, message.replace(/^.*?: /, "")),
      };
    }
    // Fallback only when the RPC itself is missing (migration not applied).
    // Matching on the message text would also catch real errors raised
    // inside the function and silently take the non-atomic path.
    if (rpcError.code === "PGRST202" || rpcError.code === "42883") {
      return applyGoalOperationLegacy(supabase, ctx, goalId, input);
    }
    return { data: null, error: err("DB", "Could not apply operation") };
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
    goal_id: string;
    operation_id: string;
  } | null;

  const refreshed = await getGoal(supabase, ctx, goalId);
  if (refreshed.error || !refreshed.data) {
    return { data: null, error: refreshed.error ?? err("DB", "Goal missing after operation") };
  }

  return {
    data: {
      goal: refreshed.data,
      operationId: row?.operation_id ?? "",
    },
    error: null,
  };
}

/** Non-atomic fallback used only when RPC migration is not yet applied. */
async function applyGoalOperationLegacy(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
  input: GoalOperationInput,
): Promise<{
  data: { goal: GoalWithProgress; operationId: string } | null;
  error: ServiceError | null;
}> {
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (goalError) {
    return { data: null, error: err("DB", goalError.message) };
  }
  if (!goal) {
    return { data: null, error: err("NOT_FOUND", "Goal not found") };
  }
  if (goal.is_archived) {
    return {
      data: null,
      error: err("VALIDATION", "Cannot modify an archived goal"),
    };
  }

  let newBalance: Money;
  const current = parseMoney(goal.current_amount);
  const amount = parseMoney(input.amount);

  if (input.type === "deposit") {
    if (amount <= BigInt(0)) {
      return { data: null, error: err("VALIDATION", "Deposit amount must be greater than zero") };
    }
    newBalance = formatMoney(current + amount);
  } else if (input.type === "withdraw") {
    if (amount <= BigInt(0)) {
      return { data: null, error: err("VALIDATION", "Withdraw amount must be greater than zero") };
    }
    if (amount > current) {
      return { data: null, error: err("VALIDATION", "Insufficient goal balance") };
    }
    newBalance = formatMoney(current - amount);
  } else {
    newBalance = input.amount;
  }

  const isCompleted = compareMoney(newBalance, goal.target_amount) >= 0;

  const { data: updated, error: updateError } = await supabase
    .from("goals")
    .update({ current_amount: newBalance, is_completed: isCompleted })
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return {
      data: null,
      error: err("DB", updateError?.message ?? "Failed to update goal"),
    };
  }

  const { data: op, error: opError } = await supabase
    .from("goal_operations")
    .insert({
      goal_id: goalId,
      household_id: ctx.householdId,
      type: input.type,
      amount: input.amount,
      balance_after: newBalance,
      note: input.note,
      operation_date: input.operationDate ?? undefined,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (opError || !op) {
    return {
      data: null,
      error: err("DB", opError?.message ?? "Failed to record operation"),
    };
  }

  return {
    data: { goal: withProgress(updated), operationId: op.id },
    error: null,
  };
}

export async function deleteGoal(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  goalId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      error: err("FORBIDDEN", "Only owners and admins can delete goals"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { error: err("NOT_FOUND", "Goal not found") };
  }

  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("household_id", ctx.householdId);

  if (error) {
    return { error: err("DB", error.message) };
  }
  return { error: null };
}

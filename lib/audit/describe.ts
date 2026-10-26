import type { Json } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  member_joined: "Member joined",
  member_role_changed: "Member role changed",
  member_removed: "Member removed",
  invitation_created: "Invitation sent",
  invitation_accepted: "Invitation accepted",
  invitation_revoked: "Invitation revoked",
  invitation_expired: "Invitation expired",
  settings_updated: "Household settings changed",
  account_created: "Account created",
  account_updated: "Account changed",
  transaction_deleted: "Transaction deleted",
  recurring_paid: "Recurring payment confirmed",
  recurring_skipped: "Recurring payment skipped",
};

export function describeAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

function asRecord(value: Json | null): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Short "field: old → new" summary of what changed. Only keys present in the
 * (whitelisted) trigger payloads are shown; ids are left out as noise.
 */
export function summarizeAuditChange(oldData: Json | null, newData: Json | null): string {
  const before = asRecord(oldData);
  const after = asRecord(newData);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !key.endsWith("_id") && key !== "created_by",
  );

  const parts: string[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    const label = key.replaceAll("_", " ");
    if (a !== undefined && b !== undefined) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        parts.push(`${label}: ${String(a)} → ${String(b)}`);
      }
    } else {
      const value = b ?? a;
      if (value !== null && value !== undefined) parts.push(`${label}: ${String(value)}`);
    }
  }
  return parts.join(" · ");
}

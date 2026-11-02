import type { Json } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  member_joined: "Участник присоединился",
  member_role_changed: "Роль участника изменена",
  member_removed: "Участник удалён",
  invitation_created: "Приглашение отправлено",
  invitation_accepted: "Приглашение принято",
  invitation_revoked: "Приглашение отозвано",
  invitation_expired: "Приглашение истекло",
  settings_updated: "Настройки семьи изменены",
  account_created: "Счёт создан",
  account_updated: "Счёт изменён",
  transaction_deleted: "Операция удалена",
  recurring_paid: "Регулярный платёж подтверждён",
  recurring_skipped: "Регулярный платёж пропущен",
};

/** Russian labels for the whitelisted trigger payload keys. */
const FIELD_LABELS: Record<string, string> = {
  email: "почта",
  role: "роль",
  status: "статус",
  name: "название",
  payment: "платёж",
  timezone: "часовой пояс",
  week_starts_on: "начало недели",
  month_starts_on: "начало месяца",
  currency: "валюта",
  initial_balance: "начальный баланс",
  is_active: "активен",
  type: "тип",
  amount: "сумма",
  transaction_date: "дата",
  scheduled_date: "дата платежа",
  expires_at: "действует до",
};

/** Russian labels for stored enum values (keys stay in English in the DB). */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  role: { owner: "владелец", admin: "админ", member: "участник", viewer: "наблюдатель" },
  status: {
    pending: "ожидает",
    accepted: "принято",
    revoked: "отозвано",
    expired: "истекло",
    paid: "оплачено",
    skipped: "пропущено",
  },
  type: { income: "доход", expense: "расход", transfer: "перевод" },
  is_active: { true: "да", false: "нет" },
};

function formatValue(key: string, value: Json | undefined): string {
  const raw = String(value);
  return VALUE_LABELS[key]?.[raw] ?? raw;
}

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
    const label = FIELD_LABELS[key] ?? key.replaceAll("_", " ");
    if (a !== undefined && b !== undefined) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        parts.push(`${label}: ${formatValue(key, a)} → ${formatValue(key, b)}`);
      }
    } else {
      const value = b ?? a;
      if (value !== null && value !== undefined) parts.push(`${label}: ${formatValue(key, value)}`);
    }
  }
  return parts.join(" · ");
}

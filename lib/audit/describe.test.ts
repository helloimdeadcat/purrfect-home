import { describe, expect, it } from "vitest";

import { describeAuditAction, summarizeAuditChange } from "./describe";

describe("audit descriptions", () => {
  it("labels known actions and falls back for unknown ones", () => {
    expect(describeAuditAction("recurring_paid")).toBe("Регулярный платёж подтверждён");
    expect(describeAuditAction("something_new")).toBe("something new");
  });

  it("summarises only changed fields and hides ids", () => {
    expect(
      summarizeAuditChange(
        { timezone: "UTC", week_starts_on: 1, default_account_id: "a" },
        { timezone: "Europe/Berlin", week_starts_on: 1, default_account_id: "b" },
      ),
    ).toBe("часовой пояс: UTC → Europe/Berlin");
  });

  it("lists values for create/delete style payloads", () => {
    expect(
      summarizeAuditChange(null, { email: "x@example.com", role: "member" }),
    ).toBe("почта: x@example.com · роль: участник");
    expect(summarizeAuditChange(null, null)).toBe("");
  });
});

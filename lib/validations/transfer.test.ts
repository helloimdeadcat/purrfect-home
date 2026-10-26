import { describe, expect, it } from "vitest";

import { createTransferSchema } from "./transfer";

const FROM = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TO = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("createTransferSchema", () => {
  it("rejects same from/to account", () => {
    const result = createTransferSchema.safeParse({
      fromAccountId: FROM,
      toAccountId: FROM,
      amount: "10.00",
      transferDate: "2026-10-17",
    });
    expect(result.success).toBe(false);
  });

  it("accepts distinct accounts", () => {
    const result = createTransferSchema.safeParse({
      fromAccountId: FROM,
      toAccountId: TO,
      amount: "10.00",
      transferDate: "2026-10-17",
    });
    if (!result.success) {
      expect(result.error.issues).toEqual([]);
    }
    expect(result.success).toBe(true);
  });
});

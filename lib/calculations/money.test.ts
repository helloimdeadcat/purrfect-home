import { describe, expect, it } from "vitest";

import {
  addMoney,
  displayMoney,
  formatMoney,
  parseMoney,
  subtractMoney,
} from "./money";

describe("parseMoney", () => {
  it("parses strings and numbers from Supabase numeric", () => {
    expect(formatMoney(parseMoney("12.50"))).toBe("12.50");
    expect(formatMoney(parseMoney(12.5))).toBe("12.50");
    expect(formatMoney(parseMoney(0))).toBe("0.00");
  });

  it("rejects invalid values", () => {
    expect(() => parseMoney("12.345")).toThrow();
    expect(() => parseMoney("abc")).toThrow();
  });
});

describe("money arithmetic", () => {
  it("adds and subtracts without float drift", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(subtractMoney("10.00", "0.01")).toBe("9.99");
  });

  it("formats for display", () => {
    expect(displayMoney("12.50", "EUR")).toContain("12");
  });
});

import { describe, expect, it } from "vitest";

import {
  computeBudgetProgress,
  overspentAmount,
} from "./budget-progress";

describe("computeBudgetProgress", () => {
  it("handles no spending", () => {
    const progress = computeBudgetProgress("100.00", "0.00");
    expect(progress.status).toBe("empty");
    expect(progress.percentUsed).toBe(0);
    expect(progress.remaining).toBe("100.00");
  });

  it("marks under and warning thresholds", () => {
    expect(computeBudgetProgress("100.00", "50.00").status).toBe("under");
    expect(computeBudgetProgress("100.00", "80.00").status).toBe("warning");
    expect(computeBudgetProgress("100.00", "79.00").status).toBe("under");
  });

  it("marks limit reached and over", () => {
    const reached = computeBudgetProgress("100.00", "100.00");
    expect(reached.status).toBe("reached");
    expect(reached.remaining).toBe("0.00");
    expect(reached.percentUsed).toBe(100);

    const over = computeBudgetProgress("100.00", "125.50");
    expect(over.status).toBe("over");
    expect(over.remaining).toBe("0.00");
    expect(over.percentUsed).toBeGreaterThan(100);
    expect(overspentAmount("100.00", "125.50")).toBe("25.50");
  });

  it("treats zero limit with spending as fully used", () => {
    const progress = computeBudgetProgress("0.00", "10.00");
    expect(progress.percentUsed).toBe(100);
  });
});

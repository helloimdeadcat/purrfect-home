import { describe, expect, it } from "vitest";

import { computeGoalProgress } from "./goal-progress";

describe("computeGoalProgress", () => {
  it("handles zero progress", () => {
    const progress = computeGoalProgress("1000.00", "0.00");
    expect(progress.status).toBe("active");
    expect(progress.percentComplete).toBe(0);
    expect(progress.remaining).toBe("1000.00");
  });

  it("caps display percent at 100 when overfunded", () => {
    const progress = computeGoalProgress("100.00", "150.00");
    expect(progress.percentComplete).toBe(100);
    expect(progress.percentRaw).toBeGreaterThan(100);
    expect(progress.remaining).toBe("0.00");
    expect(progress.isOverfunded).toBe(true);
    expect(progress.status).toBe("completed");
  });

  it("marks completed at exact target", () => {
    const progress = computeGoalProgress("250.00", "250.00");
    expect(progress.status).toBe("completed");
    expect(progress.percentComplete).toBe(100);
    expect(progress.remaining).toBe("0.00");
  });

  it("prefers archived status", () => {
    const progress = computeGoalProgress("100.00", "100.00", {
      isArchived: true,
      isCompleted: true,
    });
    expect(progress.status).toBe("archived");
  });

  it("rejects invalid target", () => {
    expect(() => computeGoalProgress("0.00", "10.00")).toThrow();
  });
});

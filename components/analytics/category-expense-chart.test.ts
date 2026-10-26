import { describe, expect, it } from "vitest";

import { foldSlices } from "./category-expense-chart";

describe("foldSlices", () => {
  it("keeps up to 8 categories untouched", () => {
    const slices = Array.from({ length: 8 }, (_, i) => ({ name: `c${i}`, value: i + 1 }));
    expect(foldSlices(slices)).toEqual(slices);
  });

  it("folds the smallest categories into Other instead of reusing colours", () => {
    const slices = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, value: (i + 1) * 10 }));
    const folded = foldSlices(slices);
    expect(folded).toHaveLength(8);
    expect(folded.slice(0, 7).map((s) => s.name)).toEqual(["c9", "c8", "c7", "c6", "c5", "c4", "c3"]);
    expect(folded[7]).toEqual({ name: "Other", value: 10 + 20 + 30 });
  });
});

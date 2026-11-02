import { describe, expect, it } from "vitest";

import { splitShoppingTitles } from "./shopping";

describe("splitShoppingTitles", () => {
  it("splits on commas and semicolons", () => {
    expect(splitShoppingTitles("молоко, хлеб; яйца")).toEqual([
      "молоко",
      "хлеб",
      "яйца",
    ]);
  });

  it("trims, drops empties, and dedupes case-insensitively", () => {
    expect(splitShoppingTitles("  Молоко , , молоко, хлеб  ")).toEqual([
      "Молоко",
      "хлеб",
    ]);
  });

  it("keeps a single title without separators", () => {
    expect(splitShoppingTitles("кошачий корм")).toEqual(["кошачий корм"]);
  });
});

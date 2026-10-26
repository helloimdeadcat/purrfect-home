import { describe, expect, it } from "vitest";

import { fetchAllPages } from "./fetch-all";

function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const buildPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { rows, calls, buildPage };
}

describe("fetchAllPages", () => {
  it("reads past the 1000-row cap", async () => {
    const table = fakeTable(2500);
    const result = await fetchAllPages(table.buildPage, 1000);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2500);
    expect(table.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("issues one request for small tables", async () => {
    const table = fakeTable(3);
    const result = await fetchAllPages(table.buildPage, 1000);
    expect(result.data).toHaveLength(3);
    expect(table.calls).toHaveLength(1);
  });

  it("issues a trailing request when the total is an exact page multiple", async () => {
    const table = fakeTable(2000);
    const result = await fetchAllPages(table.buildPage, 1000);
    expect(result.data).toHaveLength(2000);
    expect(table.calls).toHaveLength(3);
  });

  it("returns the error and no partial data when a page fails", async () => {
    let call = 0;
    const result = await fetchAllPages(async (from, to) => {
      call += 1;
      if (call === 2) return { data: null, error: { message: "boom" } };
      return {
        data: Array.from({ length: to - from + 1 }, (_, i) => from + i),
        error: null,
      };
    }, 10);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("boom");
  });
});

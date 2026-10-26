import { describe, expect, it, vi } from "vitest";

import { makeCtx, queryChain, TEST_HOUSEHOLD_ID } from "@/lib/test-utils/household-context";
import { transactionExportSchema } from "@/lib/validations/export";

import { exportTransactionsCsv } from "./export-service";

describe("transactionExportSchema", () => {
  it("requires an ordered range of at most five years", () => {
    expect(transactionExportSchema.safeParse({ from: "2026-01-01", to: "2026-03-31" }).success).toBe(true);
    expect(transactionExportSchema.safeParse({ from: "2026-03-31", to: "2026-01-01" }).success).toBe(false);
    expect(transactionExportSchema.safeParse({ from: "2018-01-01", to: "2026-01-01" }).success).toBe(false);
    expect(transactionExportSchema.safeParse({ from: "2026-01-01" }).success).toBe(false);
  });
});

describe("exportTransactionsCsv", () => {
  it("exports only non-deleted household rows, resolves names, neutralises formulas", async () => {
    const txFilters: [string, ...unknown[]][] = [];
    // Mutate the chain itself: its methods return this same object.
    const txChain = queryChain({
        data: [
          {
            id: "t1",
            transaction_date: "2026-10-02",
            type: "expense",
            adjustment_direction: null,
            amount: 12.5,
            currency: "EUR",
            account_id: "a1",
            category_id: "c1",
            income_source_id: null,
            merchant: "=HYPERLINK(\"http://evil\")",
            description: "Lunch, team",
            notes: null,
          },
        ],
        error: null,
      }) as Record<string, unknown>;
    for (const method of ["eq", "is", "gte", "lte"]) {
      txChain[method] = (...args: unknown[]) => {
        txFilters.push([method, ...args]);
        return txChain;
      };
    }

    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case "transactions":
            return txChain;
          case "accounts":
            return queryChain({ data: [{ id: "a1", name: "Giro" }], error: null });
          case "categories":
            return queryChain({ data: [{ id: "c1", name: "Food" }], error: null });
          case "tags":
            return queryChain({ data: [{ id: "g1", name: "work" }], error: null });
          case "transaction_tags":
            return queryChain({ data: [{ transaction_id: "t1", tag_id: "g1" }], error: null });
          default:
            return queryChain({ data: [], error: null });
        }
      }),
    };

    const { data, error } = await exportTransactionsCsv(supabase as never, makeCtx(), {
      from: "2026-10-01",
      to: "2026-10-31",
    });

    expect(error).toBeNull();
    expect(txFilters).toEqual(
      expect.arrayContaining([
        ["eq", "household_id", TEST_HOUSEHOLD_ID],
        ["is", "deleted_at", null],
        ["gte", "transaction_date", "2026-10-01"],
        ["lte", "transaction_date", "2026-10-31"],
      ]),
    );
    const lines = data!.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "date,type,adjustment_direction,amount,currency,account,category,income_source,tags,merchant,description,notes",
    );
    expect(lines[1]).toBe(
      `2026-10-02,expense,,12.50,EUR,Giro,Food,,work,"'=HYPERLINK(""http://evil"")","Lunch, team",`,
    );
  });
});

import { describe, expect, it } from "vitest";

import { csvFileName, escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("quotes delimiters, quotes and line breaks", () => {
    expect(escapeCsvCell("Rewe, Berlin")).toBe('"Rewe, Berlin"');
    expect(escapeCsvCell('6" sub')).toBe('"6"" sub"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell(null)).toBe("");
  });

  it("neutralises formula injection in text cells", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://evil\")")).toBe(
      '"\'=HYPERLINK(""http://evil"")"',
    );
    expect(escapeCsvCell("+1 shop")).toBe("'+1 shop");
    expect(escapeCsvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tTAB")).toBe("'\tTAB");
  });

  it("leaves trusted numeric cells untouched", () => {
    expect(escapeCsvCell({ numeric: "-12.50" })).toBe("-12.50");
    expect(escapeCsvCell(3)).toBe("3");
  });
});

describe("toCsv", () => {
  it("adds a UTF-8 BOM and CRLF rows", () => {
    const csv = toCsv(["a", "b"], [["Müller", { numeric: "1.00" }]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿a,b\r\nMüller,1.00\r\n");
  });
});

describe("csvFileName", () => {
  it("produces a safe ASCII file name", () => {
    expect(csvFileName(["transactions", "2026-01-01", "2026-03-31", "EUR"])).toBe(
      "transactions-2026-01-01-2026-03-31-EUR.csv",
    );
    expect(csvFileName(['../"evil"', "x"])).toBe("evil-x.csv");
  });
});

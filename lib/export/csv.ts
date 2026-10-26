/**
 * RFC 4180 CSV with spreadsheet-safety:
 * - fields containing delimiter, quote, CR or LF are quoted, quotes doubled;
 * - text cells starting with = + - @ TAB or CR are prefixed with an
 *   apostrophe so Excel / LibreOffice / Sheets do not evaluate them as
 *   formulas (CSV injection — e.g. a merchant named =HYPERLINK(...));
 * - numeric cells are written as-is (they come from Money strings we
 *   produce, never from user text);
 * - UTF-8 with BOM so Excel detects the encoding (ä, ü, кириллица), CRLF rows.
 */

export type CsvCell = string | number | null | undefined | { numeric: string };

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  let text: string;
  if (typeof cell === "object") {
    text = cell.numeric;
  } else if (typeof cell === "number") {
    text = String(cell);
  } else {
    text = FORMULA_TRIGGER.test(cell) ? `'${cell}` : cell;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Safe Content-Disposition filename (ASCII only, no quotes or paths). */
export function csvFileName(parts: string[]): string {
  const base = parts
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "export"}.csv`;
}

export function csvResponse(body: string, fileName: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

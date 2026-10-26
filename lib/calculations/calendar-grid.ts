import { monthEndIso, monthStartIso } from "@/lib/calculations/budget-month";

/** Monday-first week rows for a UTC calendar month (null = padding cell). */
export function buildMonthGrid(
  year: number,
  month: number,
): Array<Array<number | null>> {
  const start = monthStartIso(year, month);
  const end = monthEndIso(year, month);
  const first = new Date(`${start}T00:00:00.000Z`);
  const lastDay = Number(end.slice(8, 10));
  // JS: 0=Sun..6=Sat → Monday-first index 0=Mon..6=Sun
  const mondayIndex = (first.getUTCDay() + 6) % 7;

  const cells: Array<number | null> = [];
  for (let i = 0; i < mondayIndex; i += 1) cells.push(null);
  for (let day = 1; day <= lastDay; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export function dayIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

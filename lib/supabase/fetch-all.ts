/**
 * PostgREST caps every response at `max_rows` (Supabase default: 1000) and
 * silently drops the rest. Aggregates (balances, analytics, calendar) must
 * read every row, so they page through results with `.range()`.
 *
 * The page builder MUST apply a deterministic order ending in a unique column
 * (e.g. `.order("id")`), otherwise rows can repeat or vanish between pages.
 * PAGE_SIZE must not exceed the project's max_rows setting.
 */

export const PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) {
      return { data: null, error };
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}

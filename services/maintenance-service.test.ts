import { describe, expect, it, vi } from "vitest";

import {
  RECEIPT_PURGE_BATCH_SIZE,
  RECEIPT_PURGE_MAX_BATCHES,
  runDailyCleanup,
} from "./maintenance-service";

type Item = { receipt_id: string | null; storage_path: string };

const SQL_COUNTS = {
  notifications_read: 3,
  notifications_old: 1,
  audit_logs: 0,
  invitations: 2,
  deleted_transactions: 4,
};

/**
 * Fake service-role client: `pending` is what list_purgeable_receipt_files
 * would return; removing files / deleting rows shrinks it like the real DB.
 */
function fakeAdmin(
  initial: Item[],
  options: { removeError?: boolean; removeNothing?: boolean; rpcError?: string } = {},
) {
  let pending = [...initial];
  const log: string[] = [];
  const removedPaths = new Set<string>();

  const remove = vi.fn(async (paths: string[]) => {
    log.push(`remove:${paths.length}`);
    if (options.removeError) return { data: null, error: { message: "storage down" } };
    if (options.removeNothing) return { data: [], error: null };
    paths.forEach((p) => removedPaths.add(p));
    // Orphaned objects disappear from storage.objects once removed.
    pending = pending.filter((item) => item.receipt_id !== null || !removedPaths.has(item.storage_path));
    return { data: paths.map((name) => ({ name })), error: null };
  });

  const deleteIn = vi.fn(async (_column: string, ids: string[]) => {
    log.push(`delete:${ids.length}`);
    // Rows may only go once their file is gone.
    for (const id of ids) {
      const item = pending.find((p) => p.receipt_id === id);
      if (item && !removedPaths.has(item.storage_path)) {
        throw new Error(`row ${id} deleted before its file`);
      }
    }
    pending = pending.filter((item) => !item.receipt_id || !ids.includes(item.receipt_id));
    return { error: null, count: ids.length };
  });

  const rpc = vi.fn(async (name: string, args?: { p_limit?: number }) => {
    log.push(`rpc:${name}`);
    if (options.rpcError === name) return { data: null, error: { message: "boom" } };
    if (name === "list_purgeable_receipt_files") {
      return { data: pending.slice(0, args?.p_limit ?? 100), error: null };
    }
    return { data: SQL_COUNTS, error: null };
  });

  const admin = {
    rpc,
    storage: { from: vi.fn(() => ({ remove })) },
    from: vi.fn(() => ({ delete: vi.fn(() => ({ in: deleteIn })) })),
  };
  return { admin: admin as never, rpc, remove, deleteIn, log };
}

function receipts(n: number, prefix = "r"): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    receipt_id: `${prefix}${i}`,
    storage_path: `hh/tx/${prefix}${i}.jpg`,
  }));
}

describe("runDailyCleanup", () => {
  it("removes files in batches of 100 before deleting their rows, then runs SQL retention", async () => {
    const { admin, remove, deleteIn, log } = fakeAdmin(receipts(250));

    const result = await runDailyCleanup(admin);

    expect(remove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 100, 50]);
    expect(deleteIn.mock.calls.map(([, ids]) => ids.length)).toEqual([100, 100, 50]);
    // Every delete directly follows the remove of the same batch.
    expect(log.filter((entry) => !entry.startsWith("rpc:"))).toEqual([
      "remove:100", "delete:100", "remove:100", "delete:100", "remove:50", "delete:50",
    ]);
    expect(log.at(-1)).toBe("rpc:cleanup_expired_data");
    expect(result).toEqual({
      receipt_files_removed: 250,
      receipt_rows_deleted: 250,
      errors: 0,
      ...SQL_COUNTS,
    });
  });

  it("removes orphaned objects (no row) without touching the receipts table", async () => {
    const orphans: Item[] = [
      { receipt_id: null, storage_path: "hh/tx/o1.jpg" },
      { receipt_id: null, storage_path: "hh/tx/o2.jpg" },
    ];
    const { admin, remove, deleteIn } = fakeAdmin(orphans);

    const result = await runDailyCleanup(admin);

    expect(remove).toHaveBeenCalledWith(["hh/tx/o1.jpg", "hh/tx/o2.jpg"]);
    expect(deleteIn).not.toHaveBeenCalled();
    expect(result.receipt_files_removed).toBe(2);
    expect(result.receipt_rows_deleted).toBe(0);
  });

  it("keeps rows when Storage fails, but still runs the SQL retention", async () => {
    const { admin, deleteIn, rpc } = fakeAdmin(receipts(5), { removeError: true });

    const result = await runDailyCleanup(admin);

    expect(deleteIn).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("cleanup_expired_data");
    expect(result.errors).toBe(1);
    expect(result.deleted_transactions).toBe(4);
  });

  it("stops when orphaned objects cannot be removed instead of looping", async () => {
    const orphans: Item[] = Array.from({ length: RECEIPT_PURGE_BATCH_SIZE }, (_, i) => ({
      receipt_id: null,
      storage_path: `hh/tx/o${i}.jpg`,
    }));
    const { admin, remove } = fakeAdmin(orphans, { removeNothing: true });

    await runDailyCleanup(admin);

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("caps the number of batches per run", async () => {
    const { admin, remove } = fakeAdmin(
      receipts(RECEIPT_PURGE_BATCH_SIZE * (RECEIPT_PURGE_MAX_BATCHES + 3)),
    );

    const result = await runDailyCleanup(admin);

    expect(remove).toHaveBeenCalledTimes(RECEIPT_PURGE_MAX_BATCHES);
    expect(result.receipt_rows_deleted).toBe(RECEIPT_PURGE_BATCH_SIZE * RECEIPT_PURGE_MAX_BATCHES);
  });

  it("reports an SQL retention failure as an error count", async () => {
    const { admin } = fakeAdmin([], { rpcError: "cleanup_expired_data" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runDailyCleanup(admin);

    expect(result).toEqual({ receipt_files_removed: 0, receipt_rows_deleted: 0, errors: 1 });
    spy.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEST_HOUSEHOLD_ID,
  TEST_USER_ID,
  makeCtx,
  queryChain,
} from "@/lib/test-utils/household-context";

const adminRemove = vi.fn(async () => ({ data: [], error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: adminRemove }) },
  }),
}));

const { deleteReceipt, uploadReceipt } = await import("./receipt-service");

const TX_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_USER = "99999999-9999-9999-9999-999999999999";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(() => {
  adminRemove.mockClear();
});

describe("uploadReceipt", () => {
  it("forbids viewers before touching the database", async () => {
    const from = vi.fn();
    const { error } = await uploadReceipt(
      { from } as never,
      makeCtx({ role: "viewer" }),
      TX_ID,
      { bytes: JPEG, fileName: "a.jpg" },
    );
    expect(error?.code).toBe("FORBIDDEN");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects content that is not an allowed file type", async () => {
    const from = vi.fn();
    const { error } = await uploadReceipt(
      { from } as never,
      makeCtx(),
      TX_ID,
      { bytes: new TextEncoder().encode("<svg onload=alert(1)>"), fileName: "x.jpg" },
    );
    expect(error?.code).toBe("VALIDATION");
    expect(from).not.toHaveBeenCalled();
  });

  it("stops members from attaching to someone else's transaction", async () => {
    const supabase = {
      from: vi.fn(() =>
        queryChain({ data: { id: TX_ID, created_by: OTHER_USER }, error: null }),
      ),
    };
    const { error } = await uploadReceipt(
      supabase as never,
      makeCtx({ role: "member" }),
      TX_ID,
      { bytes: JPEG, fileName: "a.jpg" },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("removes exactly the uploaded object when the metadata insert fails", async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return queryChain({ data: { id: TX_ID, created_by: TEST_USER_ID }, error: null });
        }
        // receipts: count query first, then the failing insert
        return {
          ...queryChain({ data: null, error: null, count: 0 }),
          insert: () => queryChain({ data: null, error: { message: "boom" } }),
        };
      }),
      storage: { from: () => ({ upload }) },
    };

    const { error } = await uploadReceipt(
      supabase as never,
      makeCtx({ role: "member" }),
      TX_ID,
      { bytes: JPEG, fileName: "../../evil.jpg" },
    );

    expect(error?.code).toBe("DB");
    const uploadedPath = (upload.mock.calls[0] as unknown as [string])[0];
    expect(uploadedPath).toMatch(
      new RegExp(`^${TEST_HOUSEHOLD_ID}/${TX_ID}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(adminRemove).toHaveBeenCalledWith([uploadedPath]);
  });
});

describe("deleteReceipt", () => {
  it("forbids a member who did not upload the receipt", async () => {
    const supabase = {
      from: vi.fn(() =>
        queryChain({
          data: {
            id: "r1",
            household_id: TEST_HOUSEHOLD_ID,
            transaction_id: TX_ID,
            storage_path: `${TEST_HOUSEHOLD_ID}/${TX_ID}/x.pdf`,
            file_name: "x.pdf",
            mime_type: "application/pdf",
            file_size: 1,
            uploaded_by: OTHER_USER,
            created_at: "2026-10-20T00:00:00Z",
          },
          error: null,
        }),
      ),
    };
    const { error } = await deleteReceipt(
      supabase as never,
      makeCtx({ role: "member" }),
      "r1",
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});

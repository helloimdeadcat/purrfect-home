"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ReceiptView } from "@/services/receipt-service";

type Props = {
  transactionId: string;
  receipts: ReceiptView[];
  canUpload: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TransactionReceipts({ transactionId, receipts, canUpload }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/transactions/${transactionId}/receipts`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Upload failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(receiptId: string) {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (!canUpload && receipts.length === 0) return null;

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Receipts{receipts.length > 0 ? ` (${receipts.length})` : ""}
      </Button>

      {open ? (
        <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
          {receipts.length === 0 ? (
            <p className="text-muted-foreground">No receipts attached.</p>
          ) : (
            <ul className="grid gap-1">
              {receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex items-center justify-between gap-2"
                >
                  <a
                    href={`/api/receipts/${receipt.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate underline-offset-4 hover:underline"
                  >
                    {receipt.file_name}
                  </a>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    {formatSize(receipt.file_size)}
                    {receipt.canDelete ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void remove(receipt.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canUpload ? (
            <label className="grid gap-1">
              <span className="text-muted-foreground">
                Attach JPEG, PNG, WebP, HEIC or PDF (max 8 MB)
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
                className="text-sm file:mr-2 file:rounded-md file:border file:border-border file:bg-transparent file:px-2 file:py-1"
              />
            </label>
          ) : null}

          {pending ? <p className="text-muted-foreground">Working…</p> : null}
          {error ? (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

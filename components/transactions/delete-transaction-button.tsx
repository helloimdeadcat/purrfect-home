"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  transactionId: string;
};

export function DeleteTransactionButton({ transactionId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setPending(true);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={onDelete}
    >
      {pending ? "…" : "Delete"}
    </Button>
  );
}

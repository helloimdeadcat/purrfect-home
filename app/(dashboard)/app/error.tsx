"use client";

import Link from "next/link";
import { useEffect } from "react";

import { SleepyCat } from "@/components/cute/illustrations";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3" role="alert">
      <SleepyCat className="w-40" />
      <h1 className="text-2xl font-semibold tracking-tight">
        Oops, something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        This page could not be loaded. Your data has not been changed. Check
        your connection and try again.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => retry()}>
          Try again
        </Button>
        <Link
          href="/app/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}

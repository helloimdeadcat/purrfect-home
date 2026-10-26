import Link from "next/link";

import { SleepyCat } from "@/components/cute/illustrations";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <SleepyCat className="w-44" />
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The cat fell asleep on this page — it doesn&apos;t exist.
      </p>
      <Link href="/app/dashboard" className={cn(buttonVariants({ size: "sm" }))}>
        Go to dashboard
      </Link>
    </main>
  );
}

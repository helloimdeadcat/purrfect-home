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
        Ой, что-то пошло не так
      </h1>
      <p className="text-sm text-muted-foreground">
        Не получилось загрузить страницу. Твои данные не изменились. Проверь
        подключение и попробуй ещё раз.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => retry()}>
          Попробовать снова
        </Button>
        <Link
          href="/app/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Главная
        </Link>
      </div>
    </div>
  );
}

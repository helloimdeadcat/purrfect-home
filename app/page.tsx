import Link from "next/link";

import { CatCouple, Heart, PawPrint } from "@/components/cute/illustrations";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  { title: "Money together", text: "Shared budgets, bills on time and what's safe to spend." },
  { title: "Who does what", text: "One schedule and to-do list for both of you, with repeats." },
  { title: "Little routines", text: "Habits and meal plans you can keep up — side by side." },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <CatCouple className="w-64 sm:w-72" title="Two cats sitting together, tails forming a heart" />
        <p className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-primary uppercase">
          <Heart className="size-4" /> Purrfect Home
        </p>
        <h1 className="text-4xl font-semibold text-balance sm:text-5xl">
          Life for two, made cozy
        </h1>
        <p className="text-base text-muted-foreground text-pretty sm:text-lg">
          Money, chores, plans and routines in one calm little place — built
          for couples.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-6")}>
            Get started
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
          >
            Sign in
          </Link>
        </div>
        <ul className="mt-4 grid w-full gap-3 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="card-soft p-4">
              <PawPrint className="mb-2 size-5 text-blush" />
              <p className="font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
                {feature.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

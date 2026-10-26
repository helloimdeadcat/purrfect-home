import Link from "next/link";

import { CatCouple } from "@/components/cute/illustrations";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <Link href="/" aria-label="Purrfect Home home">
          <CatCouple className="w-44" />
        </Link>
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}

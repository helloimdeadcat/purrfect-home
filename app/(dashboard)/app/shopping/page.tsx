import Link from "next/link";
import { redirect } from "next/navigation";

import { ShoppingList } from "@/components/shopping/shopping-list";
import { canWrite, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listShoppingItems } from "@/services/shopping-service";

export default async function ShoppingPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const { data: items, error } = await listShoppingItems(supabase, ctx);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Покупки</h1>
          <p className="text-muted-foreground">
            Общий список для семьи. Можно отмечать купленное и подтянуть продукты
            из{" "}
            <Link href="/app/meals?tab=shopping" className="underline-offset-4 hover:underline">
              плана питания
            </Link>
            .
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          Не получилось загрузить список: {error.message}
        </p>
      ) : (
        <ShoppingList items={items ?? []} canEdit={canWrite(ctx.role)} />
      )}
    </div>
  );
}

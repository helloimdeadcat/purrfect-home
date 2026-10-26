import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import {
  listAccountsWithBalances,
  summarizeHouseholdWealth,
} from "@/services/account-service";
import {
  listTransactions,
  monthlyIncomeExpense,
} from "@/services/transaction-service";
import { getHouseholdToday } from "@/services/settings-service";
import { listTransfers } from "@/services/transfer-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { supabase, ctx } = auth.value;
    const { today } = await getHouseholdToday(supabase, ctx);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));

    const [accountsResult, monthResult, txResult, transferResult] =
      await Promise.all([
        listAccountsWithBalances(supabase, ctx),
        monthlyIncomeExpense(supabase, ctx, year, month),
        listTransactions(supabase, ctx, { limit: 8 }),
        listTransfers(supabase, ctx, { limit: 5 }),
      ]);

    if (accountsResult.error) return fromServiceError(accountsResult.error);
    if (monthResult.error) return fromServiceError(monthResult.error);
    if (txResult.error) return fromServiceError(txResult.error);
    if (transferResult.error) return fromServiceError(transferResult.error);

    const accounts = accountsResult.data ?? [];
    const wealth = summarizeHouseholdWealth(accounts, ctx.currency);

    return Response.json({
      household: {
        id: ctx.householdId,
        name: ctx.householdName,
        currency: ctx.currency,
        role: ctx.role,
      },
      wealth: {
        ...wealth,
        note: "Currency conversion (FX) is not implemented. Totals are never mixed across currencies.",
      },
      // Backward-compatible field: base-currency total only
      netWorth: wealth.baseTotal,
      month: {
        year,
        month,
        currency: monthResult.data?.currency ?? ctx.currency,
        income: monthResult.data?.income ?? "0.00",
        expense: monthResult.data?.expense ?? "0.00",
        otherCurrencies: monthResult.data?.otherCurrencies ?? [],
      },
      accounts,
      recentTransactions: txResult.data ?? [],
      recentTransfers: transferResult.data ?? [],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

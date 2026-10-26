import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  defaultFrom: string;
  defaultTo: string;
  currencies: string[];
};

/**
 * Plain GET form: the browser downloads the CSV straight from the API route,
 * so no client JavaScript is needed.
 */
export function ExportTransactionsForm({ defaultFrom, defaultTo, currencies }: Props) {
  return (
    <details className="card-soft px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Export to CSV</summary>
      <form
        action="/api/export/transactions"
        method="get"
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <div className="grid gap-1">
          <Label htmlFor="export-from">From</Label>
          <Input id="export-from" name="from" type="date" defaultValue={defaultFrom} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="export-to">To</Label>
          <Input id="export-to" name="to" type="date" defaultValue={defaultTo} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="export-currency">Currency</Label>
          <select
            id="export-currency"
            name="currency"
            defaultValue=""
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All currencies</option>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>
          Download
        </button>
        <p className="text-xs text-muted-foreground sm:col-span-4">
          Deleted transactions and transfers are not included. Amounts stay in
          their own currency (no conversion).
        </p>
      </form>
    </details>
  );
}

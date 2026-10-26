export function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground"
      role="status"
    >
      {message}
    </div>
  );
}

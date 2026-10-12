import { cn } from "@/lib/utils";

// The 8px strip on top of a table: solid brand colour, with a segment running
// across it while the table loads or saves.
function LoadingBar({
  loading,
  className,
}: {
  loading: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="loading-bar"
      role="progressbar"
      aria-busy={loading}
      aria-hidden={!loading}
      className={cn(
        "relative h-2 shrink-0 overflow-hidden transition-colors",
        loading ? "bg-brand/25" : "bg-brand",
        className,
      )}
    >
      {loading && (
        <div className="absolute inset-y-0 left-0 w-2/5 animate-[loading-bar_1.1s_ease-in-out_infinite] bg-brand motion-reduce:w-full motion-reduce:animate-pulse" />
      )}
    </div>
  );
}

export { LoadingBar };

// A bordered box for a table with the strip on top.
function TableFrame({
  loading,
  className,
  children,
}: {
  loading: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <LoadingBar loading={loading} />
      {children}
    </div>
  );
}

export { TableFrame };

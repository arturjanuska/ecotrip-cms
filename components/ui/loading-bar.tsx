import { cn } from "@/lib/utils";

// The 8px strip on top of a table while it loads or saves: an angled brand
// gradient runs from the left edge to the right one, over and over. Nothing
// is shown otherwise. It lies over the top of the table, so the table does not
// move when it appears: the parent needs `relative`.
function LoadingBar({
  loading,
  className,
}: {
  loading: boolean;
  className?: string;
}) {
  if (!loading) {
    return null;
  }
  return (
    <div
      data-slot="loading-bar"
      role="progressbar"
      aria-busy
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 h-2 overflow-hidden bg-brand/20",
        className,
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1/2 animate-[loading-bar_1.2s_linear_infinite] bg-[linear-gradient(115deg,transparent_0%,var(--brand)_35%,var(--brand-strong)_50%,var(--brand)_65%,transparent_100%)] motion-reduce:w-full motion-reduce:animate-pulse" />
    </div>
  );
}

export { LoadingBar };

// A bordered box for a table, with the strip on top while it loads.
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
    <div
      className={cn("relative overflow-hidden rounded-lg border", className)}
    >
      <LoadingBar loading={loading} />
      {children}
    </div>
  );
}

export { TableFrame };

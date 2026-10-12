import { cn } from "@/lib/utils";

// The 8px strip above a table while it loads or saves: an angled brand
// gradient runs from the left edge to the right one, over and over. Nothing
// is shown otherwise. It sits on the table's top border, in the gap above the
// table (8px are needed), so nothing moves when it appears: the parent needs
// `relative`, without overflow-hidden.
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
        "pointer-events-none absolute inset-x-0 bottom-full h-2 overflow-hidden rounded-t-md bg-brand/20",
        className,
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1/2 animate-[loading-bar_1.2s_linear_infinite] bg-[linear-gradient(115deg,transparent_0%,var(--brand)_35%,var(--brand-strong)_50%,var(--brand)_65%,transparent_100%)] motion-reduce:w-full motion-reduce:animate-pulse" />
    </div>
  );
}

export { LoadingBar };

// A bordered box for a table, with the strip above it while it loads.
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
    <div className="relative">
      <LoadingBar loading={loading} />
      <div className={cn("overflow-hidden rounded-lg border", className)}>
        {children}
      </div>
    </div>
  );
}

export { TableFrame };

import { cn } from "@/lib/utils";

// Mark in the company colour, used until a real logo file is added.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground",
        className,
      )}
    >
      E
    </span>
  );
}

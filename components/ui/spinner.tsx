import { cn } from "@/lib/utils";

// A spinning circle, for buttons while their action runs.
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      data-slot="spinner"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { Spinner };

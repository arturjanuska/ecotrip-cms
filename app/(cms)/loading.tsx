import { Skeleton } from "@/components/ui/skeleton";

// Shown at once on the first visit to a CMS page while the server renders it.
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 rounded-lg" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full rounded-lg" />
      ))}
    </div>
  );
}

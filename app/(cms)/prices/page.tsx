import type { Metadata } from "next";
import Link from "next/link";
import { PricesTable } from "@/components/prices-table";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Prices | Ecotrip CMS",
};

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  await requireAdminPage();
  const { imported } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Prices</h1>
        <Link
          href="/prices/import"
          className={buttonVariants({ variant: "outline" })}
        >
          Import CSV
        </Link>
      </div>
      {imported && (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
          Import applied: {imported} changes.
        </p>
      )}
      <PricesTable />
    </div>
  );
}

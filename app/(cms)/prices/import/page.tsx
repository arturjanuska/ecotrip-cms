import type { Metadata } from "next";
import Link from "next/link";
import { ImportPrices } from "@/components/import-prices";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Import prices | Ecotrip CMS",
};

export default async function ImportPricesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/prices"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Prices
        </Link>
        <h1 className="text-2xl font-semibold">Import prices</h1>
      </div>
      <ImportPrices />
    </div>
  );
}

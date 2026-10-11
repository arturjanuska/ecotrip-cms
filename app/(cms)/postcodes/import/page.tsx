import type { Metadata } from "next";
import Link from "next/link";
import { ImportPostcodes } from "@/components/import-postcodes";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Import postcodes | Ecotrip CMS",
};

export default async function ImportPostcodesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/postcodes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Postcodes
        </Link>
        <h1 className="text-2xl font-semibold">Import postcodes</h1>
      </div>
      <ImportPostcodes />
    </div>
  );
}

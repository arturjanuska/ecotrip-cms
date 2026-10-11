import type { Metadata } from "next";
import Link from "next/link";
import { PostcodesTable } from "@/components/postcodes-table";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Postcodes | Ecotrip CMS",
};

export default async function PostcodesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Postcodes</h1>
        <Link
          href="/postcodes/import"
          className={buttonVariants({ variant: "outline" })}
        >
          Import CSV
        </Link>
        {/* A plain link: the browser downloads the file the API returns. */}
        <a
          href="/api/postcodes/export"
          download
          className={buttonVariants({ variant: "outline" })}
        >
          Export CSV
        </a>
      </div>
      <PostcodesTable />
    </div>
  );
}

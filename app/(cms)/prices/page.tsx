import Link from "next/link";
import { PricesTable } from "@/components/prices-table";
import { DownloadButton } from "@/components/download-button";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("pricesPage.title") };
}

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  await requireAdminPage();
  const { imported } = await searchParams;
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">
          {t("pricesPage.title")}
        </h1>
        <Link
          href="/prices/import"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("pricesPage.importCsv")}
        </Link>
        <DownloadButton href="/api/prices/export" fallbackName="prices.json">
          {t("pricesPage.exportJson")}
        </DownloadButton>
      </div>
      {imported && (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
          {t("pricesPage.imported", {
            count: Number.isFinite(Number(imported))
              ? Number(imported)
              : imported,
          })}
        </p>
      )}
      <PricesTable />
    </div>
  );
}

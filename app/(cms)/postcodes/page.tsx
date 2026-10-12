import Link from "next/link";
import { PostcodesTable } from "@/components/postcodes-table";
import { DownloadButton } from "@/components/download-button";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("postcodesPage.title") };
}

export default async function PostcodesPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">
          {t("postcodesPage.title")}
        </h1>
        <Link
          href="/postcodes/import"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("postcodesPage.importCsv")}
        </Link>
        <DownloadButton
          href="/api/postcodes/export"
          fallbackName="postcodes.csv"
        >
          {t("postcodesPage.exportCsv")}
        </DownloadButton>
      </div>
      <PostcodesTable />
    </div>
  );
}

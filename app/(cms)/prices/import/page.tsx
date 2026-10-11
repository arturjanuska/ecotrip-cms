import Link from "next/link";
import { ImportPrices } from "@/components/import-prices";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("importPrices.title") };
}

export default async function ImportPricesPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/prices"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("importPrices.back")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("importPrices.title")}</h1>
      </div>
      <ImportPrices />
    </div>
  );
}

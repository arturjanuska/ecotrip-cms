import Link from "next/link";
import { ImportPostcodes } from "@/components/import-postcodes";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("importPostcodes.title") };
}

export default async function ImportPostcodesPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/postcodes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("importPostcodes.back")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("importPostcodes.title")}</h1>
      </div>
      <ImportPostcodes />
    </div>
  );
}

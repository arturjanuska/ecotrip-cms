import { FeesForm } from "@/components/fees-form";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("feesPage.title") };
}

export default async function FeesPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("feesPage.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("feesPage.intro")}</p>
      </div>
      <FeesForm />
    </div>
  );
}

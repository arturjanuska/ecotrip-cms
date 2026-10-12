import { DateOverridesEditor } from "@/components/date-overrides-editor";
import { requireAdminPage } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("datesPage.title") };
}

export default async function DatesPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("datesPage.title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("datesPage.intro")}
        </p>
      </div>
      <DateOverridesEditor />
    </div>
  );
}

import { ChangeLogTable } from "@/components/change-log-table";
import { requireAdminPage } from "@/lib/auth";
import { CHANGE_LOG_LIMIT } from "@/lib/change-log-types";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("changeLog.title") };
}

export default async function ChangeLogPage() {
  await requireAdminPage();
  const t = await getTranslator();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("changeLog.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("changeLog.intro", { limit: CHANGE_LOG_LIMIT })}
        </p>
      </div>
      <ChangeLogTable />
    </div>
  );
}

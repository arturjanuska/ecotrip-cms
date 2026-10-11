import type { Metadata } from "next";
import { ChangeLogTable } from "@/components/change-log-table";
import { requireAdminPage } from "@/lib/auth";
import { CHANGE_LOG_LIMIT } from "@/lib/change-log-types";

export const metadata: Metadata = {
  title: "Change log | Ecotrip CMS",
};

export default async function ChangeLogPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Change log</h1>
        <p className="text-sm text-muted-foreground">
          Every save in Postcodes, Prices and Fees: who, when and what changed.
          Only the latest {CHANGE_LOG_LIMIT} entries are kept.
        </p>
      </div>
      <ChangeLogTable />
    </div>
  );
}

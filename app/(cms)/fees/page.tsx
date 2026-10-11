import type { Metadata } from "next";
import { FeesForm } from "@/components/fees-form";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Fees | Ecotrip CMS",
};

export default async function FeesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Fees</h1>
        <p className="text-sm text-muted-foreground">
          Service fees, ParcelForce surcharges and quantity discounts the site
          adds to an order. Amounts are one number, used as £ or €.
        </p>
      </div>
      <FeesForm />
    </div>
  );
}

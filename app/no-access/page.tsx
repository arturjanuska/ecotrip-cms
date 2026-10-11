import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getAuthState } from "@/lib/auth";

export const metadata: Metadata = {
  title: "No access | Ecotrip CMS",
};

// Signed-in users without the admin role land here.
export default async function NoAccessPage() {
  const state = await getAuthState();

  if (state === "signed-out") {
    redirect("/login");
  }
  if (state === "admin") {
    redirect("/postcodes");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-t-4 border-t-brand bg-card p-6">
        <div className="flex items-center gap-2">
          <BrandMark />
          <h1 className="text-xl font-semibold">No access</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your account does not have access to Ecotrip CMS. Ask an administrator
          to grant you the admin role.
        </p>
        <SignOutButton redirectUrl="/login">
          <Button variant="outline" className="w-full">
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </div>
  );
}

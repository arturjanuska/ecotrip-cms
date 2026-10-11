import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { getAuthState } from "@/lib/auth";
import { getTranslator, pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("noAccess.title") };
}

// Signed-in users without the admin role land here.
export default async function NoAccessPage() {
  const state = await getAuthState();

  if (state === "signed-out") {
    redirect("/login");
  }
  if (state === "admin") {
    redirect("/postcodes");
  }

  const t = await getTranslator();

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-t-4 border-t-brand bg-card p-6">
        <div className="flex items-center gap-2">
          <BrandMark />
          <h1 className="text-xl font-semibold">{t("noAccess.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("noAccess.text")}</p>
        <SignOutButton redirectUrl="/login">
          <Button variant="outline" className="w-full">
            {t("noAccess.signOut")}
          </Button>
        </SignOutButton>
        <LanguageSwitcher className="justify-center" />
      </div>
    </div>
  );
}

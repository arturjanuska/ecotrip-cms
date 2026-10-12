import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { requireAdminPage } from "@/lib/auth";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/sidebar-config";

// Safety net for pages added later. Layouts are not re-rendered on client-side
// navigation, so every page must still call requireAdminPage() itself.
export default async function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  const collapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;

  return (
    <div className="min-h-screen md:flex">
      <Sidebar initialCollapsed={collapsed} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}

import { Sidebar } from "@/components/sidebar";
import { requireAdminPage } from "@/lib/auth";

// Safety net for pages added later. Layouts are not re-rendered on client-side
// navigation, so every page must still call requireAdminPage() itself.
export default async function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/postcodes", label: "Postcodes" },
  { href: "/prices", label: "Prices" },
  { href: "/fees", label: "Fees" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4 text-lg font-semibold">
        <BrandMark />
        Ecotrip CMS
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {links.map((link) => {
          const className = cn(
            "block rounded-md px-3 py-2 text-sm",
            pathname.startsWith(link.href)
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--color-brand)]"
              : "hover:bg-sidebar-accent",
          );

          // The page that is open now is not a link: clicking it would only
          // reload the same page.
          if (pathname === link.href) {
            return (
              <span
                key={link.href}
                aria-current="page"
                aria-disabled="true"
                className={cn(className, "cursor-default")}
              >
                {link.label}
              </span>
            );
          }

          return (
            <Link key={link.href} href={link.href} className={className}>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => signOut({ redirectUrl: "/login" })}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}

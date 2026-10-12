"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  CalendarDays,
  ChevronDown,
  Globe,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ScrollText,
  Tag,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/client";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from "@/lib/sidebar-config";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type NavLink = { href: string; label: string; icon: Icon };

type NavGroup = { label: string; icon: Icon; links: NavLink[] };

const websiteGroup: NavGroup = {
  label: "nav.website",
  icon: Globe,
  links: [
    { href: "/postcodes", label: "nav.postcodes", icon: MapPin },
    { href: "/prices", label: "nav.prices", icon: Tag },
    { href: "/fees", label: "nav.fees", icon: Receipt },
    { href: "/dates", label: "nav.dates", icon: CalendarDays },
  ],
};

const changelogLink: NavLink = {
  href: "/changelog",
  label: "nav.changelog",
  icon: ScrollText,
};

// Kept for a year on every path; the CMS layout reads it on each request.
function saveCollapsed(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? SIDEBAR_COLLAPSED : ""}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}

const itemClass =
  "flex h-9 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap transition-colors";
const activeClass =
  "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--color-brand)]";

// The label fades out while the sidebar narrows; it stays the accessible name.
function Label({ text, collapsed }: { text: string; collapsed: boolean }) {
  return (
    <span
      className={cn(
        "truncate transition-opacity duration-200",
        collapsed && "opacity-0",
      )}
    >
      {text}
    </span>
  );
}

function NavItem({ link, collapsed }: { link: NavLink; collapsed: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const label = t(link.label);
  const content = (
    <>
      <link.icon aria-hidden className="size-4 shrink-0" />
      <Label text={label} collapsed={collapsed} />
    </>
  );
  const className = cn(
    itemClass,
    pathname.startsWith(link.href) ? activeClass : "hover:bg-sidebar-accent",
  );
  // Collapsed, only the icon shows: the label appears on hover.
  const title = collapsed ? label : undefined;

  // The page that is open now is not a link: clicking it would only
  // reload the same page.
  if (pathname === link.href) {
    return (
      <span
        aria-current="page"
        aria-disabled="true"
        title={title}
        className={cn(className, "cursor-default")}
      >
        {content}
      </span>
    );
  }

  return (
    <Link href={link.href} title={title} className={className}>
      {content}
    </Link>
  );
}

// Accordion section. Collapsed, the sidebar has no room for its header: the
// links show as icons under a divider.
function NavSection({
  group,
  collapsed,
}: {
  group: NavGroup;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(true);
  const containsActive = group.links.some((link) =>
    pathname.startsWith(link.href),
  );
  const expanded = open || collapsed;

  return (
    <div>
      {collapsed ? (
        <div aria-hidden className="mx-3 my-[17.5px] h-px bg-sidebar-border" />
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            itemClass,
            "w-full hover:bg-sidebar-accent",
            // Closed over the open page: the header marks where it is.
            !open && containsActive && activeClass,
          )}
        >
          <group.icon aria-hidden className="size-4 shrink-0" />
          <Label text={t(group.label)} collapsed={collapsed} />
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        </button>
      )}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          inert={!expanded}
          className={cn(
            "min-h-0 space-y-1 overflow-hidden pt-1 transition-[margin,padding] duration-200",
            collapsed
              ? "ml-0 pl-0"
              : "ml-5 border-l border-sidebar-border pl-2",
          )}
        >
          {group.links.map((link) => (
            <NavItem key={link.href} link={link} collapsed={collapsed} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ initialCollapsed }: { initialCollapsed: boolean }) {
  const { signOut } = useClerk();
  const t = useT();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed(!collapsed);
    saveCollapsed(!collapsed);
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = t(collapsed ? "nav.expand" : "nav.collapse");

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-15 items-center gap-2 px-3.5 text-lg font-semibold whitespace-nowrap">
        <BrandMark />
        <Label text={t("app.name")} collapsed={collapsed} />
      </div>
      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2">
        <NavSection group={websiteGroup} collapsed={collapsed} />
        <NavItem link={changelogLink} collapsed={collapsed} />
      </nav>
      <div className="space-y-1 p-2">
        <button
          type="button"
          title={collapsed ? toggleLabel : undefined}
          onClick={toggle}
          className={cn(itemClass, "w-full hover:bg-sidebar-accent")}
        >
          <ToggleIcon aria-hidden className="size-4 shrink-0" />
          <Label text={toggleLabel} collapsed={collapsed} />
        </button>
        <button
          type="button"
          title={collapsed ? t("nav.signOut") : undefined}
          onClick={() => signOut({ redirectUrl: "/login" })}
          className={cn(itemClass, "w-full hover:bg-sidebar-accent")}
        >
          <LogOut aria-hidden className="size-4 shrink-0" />
          <Label text={t("nav.signOut")} collapsed={collapsed} />
        </button>
        <LanguageSwitcher
          className={cn("px-1.5", collapsed && "flex-col px-0")}
        />
      </div>
    </aside>
  );
}

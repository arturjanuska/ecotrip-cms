"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  CalendarDays,
  ChevronDown,
  Globe,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ScrollText,
  Tag,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/client";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from "@/lib/sidebar-config";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
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
  "flex h-11 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap transition-colors md:h-9";
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
  // Phones: the sidebar is a drawer over the page, opened from the top bar.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  // The drawer always shows labels; only the desktop sidebar narrows.
  const narrow = collapsed && desktop;

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  function toggle() {
    setCollapsed(!collapsed);
    saveCollapsed(!collapsed);
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = t(collapsed ? "nav.expand" : "nav.collapse");

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground md:hidden">
        <button
          type="button"
          aria-label={t("nav.openMenu")}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="flex size-10 items-center justify-center rounded-md hover:bg-sidebar-accent"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <BrandMark />
        <span className="font-semibold">{t("app.name")}</span>
      </header>
      <div
        aria-hidden
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 md:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        // Closed, the drawer is off screen: keep it out of the tab order.
        inert={!desktop && !drawerOpen}
        onClick={(event) => {
          // A tapped link opens another page: the drawer gets out of the way.
          if ((event.target as Element).closest("a")) {
            setDrawerOpen(false);
          }
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[translate,width] duration-200 ease-out",
          "md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0",
          drawerOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
          narrow ? "md:w-14" : "md:w-56",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-3.5 text-lg font-semibold whitespace-nowrap md:h-15">
          <BrandMark />
          <Label text={t("app.name")} collapsed={narrow} />
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={() => setDrawerOpen(false)}
            className="-mr-1.5 ml-auto flex size-10 items-center justify-center rounded-md hover:bg-sidebar-accent md:hidden"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2">
          <NavSection group={websiteGroup} collapsed={narrow} />
          <NavItem link={changelogLink} collapsed={narrow} />
        </nav>
        <div className="space-y-1 p-2">
          <button
            type="button"
            title={narrow ? toggleLabel : undefined}
            onClick={toggle}
            className={cn(
              itemClass,
              "hidden w-full hover:bg-sidebar-accent md:flex",
            )}
          >
            <ToggleIcon aria-hidden className="size-4 shrink-0" />
            <Label text={toggleLabel} collapsed={narrow} />
          </button>
          <button
            type="button"
            title={narrow ? t("nav.signOut") : undefined}
            onClick={() => signOut({ redirectUrl: "/login" })}
            className={cn(itemClass, "w-full hover:bg-sidebar-accent")}
          >
            <LogOut aria-hidden className="size-4 shrink-0" />
            <Label text={t("nav.signOut")} collapsed={narrow} />
          </button>
          <LanguageSwitcher
            className={cn("px-1.5", narrow && "flex-col px-0")}
          />
        </div>
      </aside>
    </>
  );
}

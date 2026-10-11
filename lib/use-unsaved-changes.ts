"use client";

import { useEffect } from "react";

export const LEAVE_MESSAGE =
  "You have unsaved changes. Leave this page and lose them?";

// true when a click on this link leaves the page in this tab.
function leavesPage(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a[href]")
      : null;
  if (
    !link ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  ) {
    return false;
  }
  const url = new URL(link.href, window.location.href);
  return (
    url.pathname !== window.location.pathname ||
    url.search !== window.location.search
  );
}

/**
 * While there are unsaved changes, asks before leaving the page: closing or
 * reloading the tab (browser prompt) and following a link inside the CMS,
 * such as the sidebar (client-side navigation, which beforeunload does not
 * see). The browser Back button is not covered.
 */
export function useUnsavedChanges(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // Capture phase: runs before the Link's own click handler navigates.
    const confirmLeave = (event: MouseEvent) => {
      if (leavesPage(event) && !window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", confirmLeave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", confirmLeave, true);
    };
  }, [unsaved]);
}

import { useSyncExternalStore } from "react";

// Whether a CSS media query matches. The server, and the first client render
// that hydrates its HTML, use `serverValue`; the real value follows at once.
export function useMediaQuery(query: string, serverValue: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

// Tailwind's `md` breakpoint: below it the CMS uses its phone layout.
export const DESKTOP_QUERY = "(min-width: 48rem)";

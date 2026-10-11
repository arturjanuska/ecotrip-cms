// Data the CMS pages loaded last, kept in memory for the browser tab. A page
// opened again from the sidebar shows it at once and refreshes it in the
// background, instead of a skeleton. A full reload starts empty.
const cache = new Map<string, unknown>();

export function readCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function writeCache<T>(key: string, value: T) {
  cache.set(key, value);
}

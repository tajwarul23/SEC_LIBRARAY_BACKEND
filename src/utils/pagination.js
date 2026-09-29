/**
 * Offset/limit parsing for list endpoints. Page size is capped so a single
 * request (?limit=1000000) can't make the server load a whole collection.
 */
export const MAX_PAGE_SIZE = 100;

export function clampLimit(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_PAGE_SIZE);
}

export function clampOffset(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

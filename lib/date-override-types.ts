// Pickup and delivery dates set by hand for one month and direction. The site
// (ecotrip-react, src/utils/transportDates.ts) offers these trips instead of
// the ones it calculates for that month; it still keeps only the odd or even
// weeks of the order's postcode, and ParcelForce delivers a week later.

export const DIRECTIONS = ["LT-UK", "UK-LT"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Both ends included, as YYYY-MM-DD.
export type DateRange = { from: string; to: string };

export type Trip = { pickup: DateRange; delivery: DateRange };

export type DateOverride = {
  direction: Direction;
  year: number;
  // 1-12: the month the pickups start in.
  month: number;
  trips: Trip[];
};

export type StoredDateOverride = DateOverride & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type DateOverrideList = { items: StoredDateOverride[] };

// Days from the Monday of the pickup week, as the site calculates them.
// UK-LT: picked up Friday-Sunday, delivered Wednesday-Thursday the week after.
// LT-UK: picked up Tuesday-Wednesday, delivered Friday-Sunday the same week.
const ROUTES: Record<
  Direction,
  { pickup: [number, number]; delivery: [number, number] }
> = {
  "UK-LT": { pickup: [4, 6], delivery: [9, 10] },
  "LT-UK": { pickup: [1, 2], delivery: [4, 6] },
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates as UTC midnights: no time zone or daylight saving shifts.
function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * The trips the site calculates for a month, every week (the site then keeps
 * the odd or even weeks of a postcode): a starting point to edit.
 */
export function calculatedTrips(
  direction: Direction,
  year: number,
  month: number,
): Trip[] {
  const { pickup, delivery } = ROUTES[direction];
  const first = utcDate(year, month, 1);
  // Monday of the week of the 1st (getUTCDay: Sunday 0).
  let monday = addDays(first, -((first.getUTCDay() + 6) % 7));
  const trips: Trip[] = [];

  for (; ; monday = addDays(monday, 7)) {
    const from = addDays(monday, pickup[0]);
    if (from.getUTCMonth() + 1 !== month && from > first) {
      break;
    }
    if (from.getUTCMonth() + 1 === month) {
      trips.push({
        pickup: {
          from: isoDate(from),
          to: isoDate(addDays(monday, pickup[1])),
        },
        delivery: {
          from: isoDate(addDays(monday, delivery[0])),
          to: isoDate(addDays(monday, delivery[1])),
        },
      });
    }
  }
  return trips;
}

// Monday of ISO week 1 of 2026: the site counts odd and even weeks from it
// (ecotrip-react, src/utils/transportDates.ts; keep the two in sync), so they
// alternate across New Year.
const PARITY_ANCHOR = Date.UTC(2025, 11, 29);

// Whether the week of `date` (YYYY-MM-DD) is an even one: postcodes with the
// "Even" calendar see its trips, "Odd" ones do not.
export function isEvenWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const monday = addDays(day, -((day.getUTCDay() + 6) % 7));
  const weeks = Math.round((monday.getTime() - PARITY_ANCHOR) / DAY_MS / 7);
  return Math.abs(weeks) % 2 === 1;
}

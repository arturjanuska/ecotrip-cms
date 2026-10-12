import { z } from "zod";
import { DIRECTIONS } from "@/lib/date-override-types";

// Custom messages are message keys (lib/i18n), translated by the CMS. Issue
// paths point at the field, so the editor shows each error under its input.

// The site shows a window as day numbers ("30 - 1"): a window is at most a
// week long.
export const MAX_WINDOW_DAYS = 7;
export const MAX_TRIPS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function isRealDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
  .refine(isRealDate, "validation.date");

function days(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

const rangeSchema = z
  .strictObject({ from: isoDate, to: isoDate })
  .superRefine((range, ctx) => {
    if (range.to < range.from) {
      ctx.addIssue({
        code: "custom",
        message: "validation.endBeforeStart",
        path: ["to"],
      });
    } else if (days(range.from, range.to) >= MAX_WINDOW_DAYS) {
      ctx.addIssue({
        code: "custom",
        message: "validation.windowTooLong",
        path: ["to"],
      });
    }
  });

const tripSchema = z
  .strictObject({ pickup: rangeSchema, delivery: rangeSchema })
  .superRefine((trip, ctx) => {
    if (trip.delivery.from < trip.pickup.to) {
      ctx.addIssue({
        code: "custom",
        message: "validation.deliveryBeforePickup",
        path: ["delivery", "from"],
      });
    }
  });

export const dateOverrideSchema = z
  .strictObject({
    direction: z.enum(DIRECTIONS),
    year: z.number().int().min(2024).max(2100),
    month: z.number().int().min(1).max(12),
    trips: z.array(tripSchema).max(MAX_TRIPS),
  })
  .superRefine((override, ctx) => {
    if (
      !Number.isInteger(override.month) ||
      override.month < 1 ||
      override.month > 12
    ) {
      return;
    }
    const month = `${override.year}-${String(override.month).padStart(2, "0")}`;
    const starts = new Set<string>();

    override.trips.forEach((trip, index) => {
      const path = ["trips", index, "pickup", "from"];
      if (!isRealDate(trip.pickup.from)) {
        return;
      }
      if (!trip.pickup.from.startsWith(month)) {
        ctx.addIssue({
          code: "custom",
          message: "validation.pickupOutsideMonth",
          path,
        });
      } else if (starts.has(trip.pickup.from)) {
        ctx.addIssue({
          code: "custom",
          message: "validation.tripRepeats",
          path,
        });
      }
      starts.add(trip.pickup.from);
    });
  })
  // Saved in date order, as the site lists them.
  .transform((override) => ({
    ...override,
    trips: [...override.trips].sort((a, b) =>
      a.pickup.from.localeCompare(b.pickup.from),
    ),
  }));

export const putDateOverrideBodySchema = z.strictObject({
  override: dateOverrideSchema,
  updatedAt: z.iso.datetime(),
});

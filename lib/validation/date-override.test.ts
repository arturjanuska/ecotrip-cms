import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { calculatedTrips, type DateOverride } from "@/lib/date-override-types";
import { dateOverrideSchema } from "@/lib/validation/date-override";

function december(): DateOverride {
  return {
    direction: "LT-UK",
    year: 2026,
    month: 12,
    trips: calculatedTrips("LT-UK", 2026, 12),
  };
}

// "path: message" of every issue.
function issues(value: unknown) {
  const result = dateOverrideSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
}

describe("dateOverrideSchema", () => {
  it("has the DateOverride shape", () => {
    const fromSchema: DateOverride = december() as z.output<
      typeof dateOverrideSchema
    >;
    expect(issues(fromSchema)).toEqual([]);
  });

  it("accepts a month with no trips: nothing is picked up", () => {
    expect(issues({ ...december(), trips: [] })).toEqual([]);
  });

  it("sorts the trips by pickup", () => {
    const override = december();
    override.trips.reverse();
    const parsed = dateOverrideSchema.parse(override);
    expect(parsed.trips[0].pickup.from).toBe("2026-12-01");
  });

  it("points at the wrong field", () => {
    const override = december();
    override.trips[0].pickup.from = "2026-11-31";
    override.trips[1].pickup.to = "2026-12-07";
    override.trips[2].delivery = { from: "2026-12-14", to: "2026-12-22" };
    override.trips[3].pickup = { from: "2027-01-05", to: "2027-01-06" };
    override.trips[3].delivery = { from: "2027-01-08", to: "2027-01-10" };
    override.trips[4].pickup = { from: "2026-12-15", to: "2026-12-16" };
    expect(issues(override)).toEqual([
      "trips.0.pickup.from: validation.date",
      "trips.1.pickup.to: validation.endBeforeStart",
      "trips.2.delivery.to: validation.windowTooLong",
      "trips.2.delivery.from: validation.deliveryBeforePickup",
      "trips.3.pickup.from: validation.pickupOutsideMonth",
      "trips.4.pickup.from: validation.tripRepeats",
    ]);
  });

  it("rejects an unknown direction or month", () => {
    expect(issues({ ...december(), direction: "LT-LT" })).toHaveLength(1);
    expect(issues({ ...december(), month: 13 })).toHaveLength(1);
  });
});

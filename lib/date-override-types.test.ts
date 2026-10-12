import { describe, expect, it } from "vitest";
import {
  calculatedTrips,
  isEvenWeek,
  parcelForceDeliveryOf,
} from "@/lib/date-override-types";

describe("calculatedTrips", () => {
  it("gives the LT-UK trips of December 2026", () => {
    expect(calculatedTrips("LT-UK", 2026, 12)).toEqual([
      {
        pickup: { from: "2026-12-01", to: "2026-12-02" },
        delivery: { from: "2026-12-04", to: "2026-12-06" },
      },
      {
        pickup: { from: "2026-12-08", to: "2026-12-09" },
        delivery: { from: "2026-12-11", to: "2026-12-13" },
      },
      {
        pickup: { from: "2026-12-15", to: "2026-12-16" },
        delivery: { from: "2026-12-18", to: "2026-12-20" },
      },
      {
        pickup: { from: "2026-12-22", to: "2026-12-23" },
        delivery: { from: "2026-12-25", to: "2026-12-27" },
      },
      {
        pickup: { from: "2026-12-29", to: "2026-12-30" },
        delivery: { from: "2027-01-01", to: "2027-01-03" },
      },
    ]);
  });

  it("keeps a window that starts in the month and ends in the next", () => {
    const trips = calculatedTrips("UK-LT", 2026, 10);
    expect(trips.map((trip) => trip.pickup)).toEqual([
      { from: "2026-10-02", to: "2026-10-04" },
      { from: "2026-10-09", to: "2026-10-11" },
      { from: "2026-10-16", to: "2026-10-18" },
      { from: "2026-10-23", to: "2026-10-25" },
      { from: "2026-10-30", to: "2026-11-01" },
    ]);
    expect(trips[4].delivery).toEqual({ from: "2026-11-04", to: "2026-11-05" });
  });

  it("leaves out a window that started in the month before", () => {
    // Friday 30 January - Sunday 1 February 2026.
    expect(calculatedTrips("UK-LT", 2026, 2)[0].pickup.from).toBe("2026-02-06");
  });
});

describe("isEvenWeek", () => {
  it("follows ISO week numbers in 2026 and alternates across New Year", () => {
    // ISO weeks 1, 42, 52, 53, then 1 and 2 of 2027.
    expect(
      [
        "2026-01-01",
        "2026-10-13",
        "2026-12-22",
        "2026-12-29",
        "2027-01-05",
        "2027-01-12",
      ].map(isEvenWeek),
    ).toEqual([false, true, true, false, true, false]);
  });
});

describe("parcelForceDeliveryOf", () => {
  const trip = {
    pickup: { from: "2026-12-18", to: "2026-12-20" },
    delivery: { from: "2026-12-22", to: "2026-12-24" },
  };

  it("is a week after the delivery when not set", () => {
    expect(parcelForceDeliveryOf(trip)).toEqual({
      from: "2026-12-29",
      to: "2026-12-31",
    });
  });

  it("is its own dates when set", () => {
    const own = { from: "2026-12-23", to: "2026-12-24" };
    expect(parcelForceDeliveryOf({ ...trip, parcelForceDelivery: own })).toBe(
      own,
    );
  });
});

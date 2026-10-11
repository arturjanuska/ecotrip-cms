import { z } from "zod";
import { PARCEL_FORCE_ZONES } from "@/lib/fee-types";
import { msg } from "@/lib/i18n/translate";

// Every object is strict: an unknown field is an error, not dropped. Issue
// paths point at the field, so the CMS form shows each error under its input.
// Custom messages are message keys (lib/i18n), translated by the CMS.

const money = z.number().min(0, "validation.nonNegative");
const positive = z.number().positive("validation.positive");
const percent = z
  .number()
  .min(0, "validation.percentRange")
  .max(100, "validation.percentRange");

const percentFeeSchema = z
  .strictObject({
    percent,
    min: money.nullable(),
    max: money.nullable(),
  })
  .superRefine((fee, ctx) => {
    // A negative bound already has its own error.
    if (
      fee.min !== null &&
      fee.max !== null &&
      fee.max >= 0 &&
      fee.min > fee.max
    ) {
      ctx.addIssue({
        code: "custom",
        message: "validation.maxBelowMin",
        path: ["max"],
      });
    }
  });

const tiersSchema = z
  .array(z.strictObject({ upToWeight: positive, fee: money }))
  .min(1, "validation.addTier")
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      if (index > 0 && tier.upToWeight <= tiers[index - 1].upToWeight) {
        ctx.addIssue({
          code: "custom",
          message: "validation.tiersAscending",
          path: [index, "upToWeight"],
        });
      }
    });
  });

const zonesSchema = z
  .array(z.strictObject({ zone: z.enum(PARCEL_FORCE_ZONES), fee: money }))
  .superRefine((zones, ctx) => {
    const inOrder =
      zones.length === PARCEL_FORCE_ZONES.length &&
      zones.every((row, index) => row.zone === PARCEL_FORCE_ZONES[index]);
    if (!inOrder) {
      ctx.addIssue({
        code: "custom",
        message: msg("validation.zonesOrder", {
          zones: PARCEL_FORCE_ZONES.join(", "),
        }),
      });
    }
  });

const quantityDiscountsSchema = z
  .array(
    z.strictObject({
      fromParcels: z
        .number()
        .int("validation.wholeNumber")
        .positive("validation.positive"),
      percent,
    }),
  )
  .min(1, "validation.addDiscountRow")
  .superRefine((rows, ctx) => {
    if (rows[0] && rows[0].fromParcels !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "validation.firstRowFromOne",
        path: [0, "fromParcels"],
      });
    }
    rows.forEach((row, index) => {
      if (index > 0 && row.fromParcels <= rows[index - 1].fromParcels) {
        ctx.addIssue({
          code: "custom",
          message: "validation.rowsAscending",
          path: [index, "fromParcels"],
        });
      }
    });
  });

export const feeSettingsSchema = z.strictObject({
  addressService: z.strictObject({ fee: money }),
  purchaseService: z.strictObject({
    threshold: positive,
    ownMoney: percentFeeSchema,
    clientMoney: percentFeeSchema,
  }),
  salesService: percentFeeSchema,
  parcelForce: z.strictObject({
    small: z.strictObject({
      maxSide: positive,
      maxWeight: positive,
      fee: money,
    }),
    medium: z.strictObject({ maxSide: positive, tiers: tiersSchema }),
    zones: zonesSchema,
  }),
  quantityDiscounts: quantityDiscountsSchema,
});

// PUT /api/fees. `updatedAt` is the version the client read.
export const putFeesBodySchema = z.strictObject({
  settings: feeSettingsSchema,
  updatedAt: z.iso.datetime(),
});

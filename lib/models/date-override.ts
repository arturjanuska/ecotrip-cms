import { Schema, model, models, type Model } from "mongoose";
import type { DateOverride } from "@/lib/date-override-types";

// lib/validation/date-override.ts checks a month before it is written; this
// schema only stores it. One document per direction and month.
const dateRangeSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false },
);

const dateOverrideSchema = new Schema(
  {
    direction: { type: String, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    trips: {
      type: [
        new Schema(
          {
            pickup: dateRangeSchema,
            delivery: dateRangeSchema,
            // Missing: a week after the delivery.
            parcelForceDelivery: { type: dateRangeSchema, required: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);
dateOverrideSchema.index({ direction: 1, year: 1, month: 1 }, { unique: true });

export const DateOverrideModel: Model<DateOverride> =
  (models.DateOverride as Model<DateOverride> | undefined) ??
  model<DateOverride>("DateOverride", dateOverrideSchema);

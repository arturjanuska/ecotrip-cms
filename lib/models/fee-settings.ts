import { Schema, model, models, type Model } from "mongoose";
import type { FeeSettings } from "@/lib/fee-types";

// One document holds every fee. lib/validation/fees.ts checks it before it is
// written; this schema only stores it. The parts are always replaced whole, so
// they are Mixed.
const feeSettingsSchema = new Schema(
  {
    addressService: { type: Schema.Types.Mixed, required: true },
    purchaseService: { type: Schema.Types.Mixed, required: true },
    salesService: { type: Schema.Types.Mixed, required: true },
    parcelForce: { type: Schema.Types.Mixed, required: true },
    quantityDiscounts: { type: [Schema.Types.Mixed], default: [] },
  },
  {
    collection: "feesettings",
    timestamps: true,
    versionKey: false,
    minimize: false,
  },
);

export const FeeSettingsModel: Model<FeeSettings> =
  (models.FeeSettings as Model<FeeSettings> | undefined) ??
  (model("FeeSettings", feeSettingsSchema) as unknown as Model<FeeSettings>);

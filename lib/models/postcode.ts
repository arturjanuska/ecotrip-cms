import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose";

const optionalText = { type: String, default: "", trim: true };

const postcodeSchema = new Schema(
  {
    postcode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    town: { type: String, required: true, trim: true },
    region: optionalText,
    country: { type: String, required: true, trim: true },
    countryString: optionalText,
    basicPrice: optionalText,
    // An amount added to the order ("0", "15", "-5"); never empty.
    additionalCharges: { type: String, default: "0", trim: true },
    // A ParcelForce area: ParcelForce service, surcharges and delivery dates.
    isParcelForce: { type: Boolean, default: false },
    parcelForceZone: optionalText,
    // Percent, "0" to "100"; never empty.
    discount: { type: String, default: "0", trim: true },
    calendar: optionalText,
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export type PostcodeRecord = InferSchemaType<typeof postcodeSchema>;

export const Postcode: Model<PostcodeRecord> =
  (models.Postcode as Model<PostcodeRecord> | undefined) ??
  model<PostcodeRecord>("Postcode", postcodeSchema);

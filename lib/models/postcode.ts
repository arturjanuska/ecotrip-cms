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
    // "" or an amount added to the order ("15", "-5").
    additionalCharges: optionalText,
    // A ParcelForce area: ParcelForce service, surcharges and delivery dates.
    isParcelForce: { type: Boolean, default: false },
    parcelForceZone: optionalText,
    discount: optionalText,
    calendar: optionalText,
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export type PostcodeRecord = InferSchemaType<typeof postcodeSchema>;

export const Postcode: Model<PostcodeRecord> =
  (models.Postcode as Model<PostcodeRecord> | undefined) ??
  model<PostcodeRecord>("Postcode", postcodeSchema);

import { Schema, model, models, type Model } from "mongoose";
import type { Category } from "@/lib/price-types";

// lib/validation/price.ts checks every document before it is written; this
// schema only stores it. Subcategories and pricing are always replaced whole,
// so they are Mixed.
const priceCategorySchema = new Schema(
  {
    value: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    sheet: { type: String, required: true },
    order: { type: Number, required: true },
    subCategories: { type: [Schema.Types.Mixed], default: [] },
    pricing: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false, minimize: false },
);

export const PriceCategory: Model<Category> =
  (models.PriceCategory as Model<Category> | undefined) ??
  (model("PriceCategory", priceCategorySchema) as unknown as Model<Category>);

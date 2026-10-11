// Order fees and discounts shared by the CMS and ecotrip-react. ecotrip-react
// keeps a copy of these types in src/utils/orderFees.ts: change both together.
// Every amount is one number, used as £ or € depending on the direction.

import { PARCEL_FORCE_ZONES } from "@/lib/postcode-options";

// Postcodes use the same zones; the copy in ecotrip-react defines them inline.
export { PARCEL_FORCE_ZONES };
export type ParcelForceZone = (typeof PARCEL_FORCE_ZONES)[number];

// A percentage of an amount, kept within optional bounds. Same number in £ and €.
export type PercentFee = {
  percent: number;
  min: number | null;
  max: number | null;
};

export type FeeSettings = {
  addressService: { fee: number };
  purchaseService: {
    threshold: number; // below: ownMoney, item price added to the order; from it: clientMoney
    ownMoney: PercentFee;
    clientMoney: PercentFee;
  };
  salesService: PercentFee;
  parcelForce: {
    small: { maxSide: number; maxWeight: number; fee: number };
    medium: { maxSide: number; tiers: { upToWeight: number; fee: number }[] };
    zones: { zone: ParcelForceZone; fee: number }[];
  };
  // fromParcels ascending, first is 1; the last row covers "and more".
  quantityDiscounts: { fromParcels: number; percent: number }[];
};

// The settings as GET /api/fees returns them.
export type StoredFeeSettings = FeeSettings & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

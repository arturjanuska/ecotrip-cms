import type { FeeSettings } from "@/lib/fee-types";

// Initial fees and discounts, taken from ecotrip-react's getOrderPrice.ts and
// the price spreadsheet («Paslaugų įkainiai», «NUOLAIDOS»). Used once by
// scripts/import-fees.ts; after that the CMS is the source.
export const INITIAL_FEE_SETTINGS: FeeSettings = {
  addressService: { fee: 0 },
  purchaseService: {
    threshold: 250,
    ownMoney: { percent: 3, min: 5, max: null },
    clientMoney: { percent: 2, min: 15, max: 50 },
  },
  salesService: { percent: 2, min: 15, max: 50 },
  parcelForce: {
    small: { maxSide: 45, maxWeight: 2, fee: 4.19 },
    medium: {
      maxSide: 61,
      tiers: [
        { upToWeight: 2, fee: 5.89 },
        { upToWeight: 10, fee: 7.59 },
        { upToWeight: 20, fee: 11.69 },
      ],
    },
    zones: [
      { zone: "Zone 1", fee: 9 },
      { zone: "Zone 2", fee: 19 },
      { zone: "Zone 3", fee: 23 },
    ],
  },
  quantityDiscounts: [
    { fromParcels: 1, percent: 0 },
    { fromParcels: 2, percent: 0 },
    { fromParcels: 3, percent: 5 },
    { fromParcels: 4, percent: 10 },
    { fromParcels: 5, percent: 15 },
  ],
};

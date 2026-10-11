# Order fees and discounts in Ecotrip CMS

Date: 2026-10-11. Status: agreed in chat.

## Goal

The bottom of the price spreadsheet («Paslaugų įkainiai», «NUOLAIDOS») and the ParcelForce surcharges are hardcoded in ecotrip-react (`src/utils/getOrderPrice.ts`). Move every number to the CMS: one page **Fees** where each field explains what it does, with an example. The site reads them from a public API. Behaviour of the site does not change.

## Decisions

| Question | Decision |
| --- | --- |
| Purchase threshold (250) | editable |
| ParcelForce surcharges | in the CMS |
| Currency | one number, used as £ or € (as today) |
| Postcode discount (`discount` of a postcode) | stays in Postcodes; the larger of postcode and quantity discount applies (as today) |
| Postcode `additionalCharges` as a number | stays as today (postcode data) |
| Storage | one document in collection `feesettings` |
| UI language | English, like the rest of the CMS |

## Data model (`lib/fee-types.ts`, copy in ecotrip-react `src/utils/orderFees.ts`)

```ts
// A percentage of an amount, kept within optional bounds. Same number in £ and €.
export type PercentFee = { percent: number; min: number | null; max: number | null };

export const PARCEL_FORCE_ZONES = ["Zone 1", "Zone 2", "Zone 3"] as const;
export type ParcelForceZone = (typeof PARCEL_FORCE_ZONES)[number];

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

export type StoredFeeSettings = FeeSettings & { _id: string; createdAt: string; updatedAt: string };
```

Initial values (today's code and spreadsheet):

```ts
{
  addressService: { fee: 0 },
  purchaseService: {
    threshold: 250,
    ownMoney: { percent: 3, min: 5, max: null },
    clientMoney: { percent: 2, min: 15, max: 50 },
  },
  salesService: { percent: 2, min: 15, max: 50 },
  parcelForce: {
    small: { maxSide: 45, maxWeight: 2, fee: 4.19 },
    medium: { maxSide: 61, tiers: [ { upToWeight: 2, fee: 5.89 }, { upToWeight: 10, fee: 7.59 }, { upToWeight: 20, fee: 11.69 } ] },
    zones: [ { zone: "Zone 1", fee: 9 }, { zone: "Zone 2", fee: 19 }, { zone: "Zone 3", fee: 23 } ],
  },
  quantityDiscounts: [ { fromParcels: 1, percent: 0 }, { fromParcels: 2, percent: 0 }, { fromParcels: 3, percent: 5 }, { fromParcels: 4, percent: 10 }, { fromParcels: 5, percent: 15 } ],
}
```

### Validation (Zod, `lib/validation/fees.ts`)

- Money and fees: finite, ≥ 0. Percent: 0–100. `min`, `max`: ≥ 0 or null; when both set, `min ≤ max`.
- `threshold` > 0.
- ParcelForce: `maxSide`, `maxWeight`, `upToWeight` > 0; medium tiers: at least one, `upToWeight` strictly ascending; zones: exactly the three zones, in order.
- Quantity discounts: at least one row; first `fromParcels` = 1; integers, strictly ascending; percent 0–100.
- Unknown fields rejected.

## Calculation (ecotrip-react, unchanged behaviour)

- `percentFee(amount, rule)` = amount × percent / 100, raised to `min`, lowered to `max`.
- Purchase service, `sum` = sum of item prices: `sum < threshold` → `percentFee(sum, ownMoney)` and the item prices are added to the order; otherwise `percentFee(sum, clientMoney)`.
- Sales service: `percentFee(sum of item prices, salesService)`.
- Address service: `addressService.fee` once per order (0 today).
- ParcelForce, per parcel, only for the ParcelForce service:
  1. any side ≤ `small.maxSide` and weight ≤ `small.maxWeight` → `small.fee`;
  2. else any side ≤ `medium.maxSide` and weight ≤ last `upToWeight` → fee of the first tier with weight ≤ `upToWeight`;
  3. else, when the postcode is a ParcelForce area → fee of its zone; otherwise 0.
- Quantity discount: the row with the largest `fromParcels` ≤ number of parcels (0 parcels counts as 1). The larger of it and the postcode discount applies (postcode discount does not apply to the address service).

## API

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/fees` | public, CORS like `/api/prices` |
| PUT | `/api/fees` | admin, JSON |

- `GET` → the stored document (`StoredFeeSettings`); 404 when not seeded.
- `PUT` body `{ settings: FeeSettings, updatedAt: string }`. Written with filter `{ updatedAt }`; changed since → 409 "Fees changed since you opened the page. Reload it."; no document → 404. Response: the saved document.

## Seed

`scripts/data/fee-settings.ts` (initial values) and `npm run import:fees`: dry run validates and says whether the document exists; `-- --write` inserts it only when there is none.

## UI: `/fees` (sidebar «Fees»)

`requireAdminPage()`. One form, sections as below; every field has a short help text with an example (texts below are final). Numbers only; zones and their order are fixed. Quantity discount rows can be added and removed (the first row stays). Draft is kept until Save: unsaved count, `beforeunload` warning, field errors under the field, Save disabled while errors exist, 409 message keeps the draft.

Help texts:

**Address service**
- Fee — «Added once to an order with the shopping address service. Example: 3 → the order total grows by £3 (or €3).»

**Purchase service** (we buy the item for the client)
- Threshold — «Sum of the item prices that decides who pays for the items. Below it we pay with our money and the item prices are added to the order; from it the client pays the seller. Example: 250 → items for £249 are bought with our money, items for £250 with the client's.»
- Our money: percent / min / max — «Fee when the items cost less than the threshold: percent of the item prices, at least min, at most max (empty = no limit). Example: 3%, min 5 → items for £100 give £5 (3% is £3, raised to the min); items for £200 give £6.»
- Client's money: percent / min / max — «Fee when the items cost the threshold or more. Example: 2%, min 15, max 50 → £500 gives £15, £1,000 gives £20, £3,000 gives £50.»

**Sales service** (we sell the client's item)
- Percent / min / max — «Fee from the item prices the client enters. Example: 2%, min 15, max 50 → an item for £400 gives £15, for £1,500 gives £30.»

**ParcelForce surcharges** (added to each parcel of the ParcelForce service)
- Small parcel: max side / max weight / fee — «Applies when at least one side is up to max side and the weight is up to max weight. Example: 45 cm, 2 kg, 4.19 → a 40×50×60 cm parcel of 1.5 kg adds £4.19.»
- Medium parcel: max side, then weight tiers (up to kg → fee) — «Applies when the small rule does not and at least one side is up to max side: the first tier whose weight limit is not exceeded. Example: 61 cm; up to 10 kg → 7.59 → a 60×70×80 cm parcel of 8 kg adds £7.59. Heavier than the last tier: the zone rule below.»
- Zones: Zone 1 / 2 / 3 fee — «Applies when neither rule above does and the order's UK postcode is in a ParcelForce area: fee of that postcode's zone (set in Postcodes). Example: Zone 2 → 19 → a 25 kg parcel to a Zone 2 postcode adds £19.»

**Quantity discounts** (one sender to one receiver)
- Rows «from N parcels → percent» — «Discount on the whole order by the number of parcels; the row with the largest N not above the count applies, the last row covers more. If the postcode has its own discount, the larger one applies. Example: from 3 → 5% → an order of 3 parcels for £200 costs £190.»

## ecotrip-react

- `src/utils/orderFees.ts`: types (copy, "keep in sync") and the functions above, with tests.
- `useFeeSettings()` like `usePriceCatalog()`: snapshot `src/data/feeSettings.snapshot.json` as fallback, refreshed by `prebuild`; the form waits for it with prices (5 s, then snapshot).
- `getOrderPrice.ts` reads the numbers from the settings; descriptions and texts unchanged.
- One-off parity check: old and new `getOrderPrice` on a grid of services, sums, sizes, weights, zones and parcel counts; result shown to the owner.

## Out of scope

- Per-direction values (one number for £ and €).
- Moving the postcode discount or `additionalCharges` here.

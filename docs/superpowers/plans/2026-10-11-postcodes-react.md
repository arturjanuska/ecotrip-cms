# Postcodes: ecotrip-react reads them from the CMS

Repository: `arturjanuska/ecotrip-react`, branch `feat`.

## Decisions

- The site looks up only the postcodes it needs: `GET /api/postcodes?postcode=<outcode>&limit=500`, exact match on the client (the API matches by prefix). Only active records (API default).
- Snapshot `src/data/postcodes.snapshot.json` (10 fields per record, no ids) answers until the CMS does and when it is unreachable (`console.warn`). `prebuild` (`scripts/update-cms-snapshots.mjs`) refreshes it together with the price snapshot, paging by 500; on failure the old snapshot stays.
- Initial snapshot = the site's old `ukPostCodesv2.ts` (2854 records, identical to the CMS seed).
- Behaviour unchanged: ParcelForce when any postcode is in a "Parcel force pricelist" area; details of the first known postcode drive zone, discount and delivery weeks (`calendar` of the record instead of the odd/even lists).
- `checkPostCodes.ts` and `ukPostCodesv2.ts` stay with a DEPRECATED note (owner's decision, as with prices).

## Verification

- `src/utils/postcodes.test.ts`: parity with the old `checkParcelForcePostcodes` for every area (outcode and full postcode) and with the old odd/even week lists.
- Browser against a mock CMS: same service set as the old site for a ParcelForce area, a plain area and an unknown one; CMS off → snapshot.

# Prices, part 2: ecotrip-react reads prices from the CMS

Spec: `docs/superpowers/specs/2026-10-11-prices-design.md` (sections «Интеграция в ecotrip-react», «Тесты»).
Repository: `arturjanuska/ecotrip-react`, branch `feat`.

## Decisions (brainstorming)

- Category Select order = CMS `order`; Sub Category order = array order (was: shipments first, then alphabetical by i18n key).
- A Size or Specification with a single option: the select is hidden and nothing is written to the form (orders look as before). `findVariant` treats an empty selection as "any" and returns a variant only when exactly one matches.
- Specification options are filtered by the selected size.
- Category-level `callManager` (palettes) keeps today's UI: Amount input with the manager message.
- `measured`: if a base lacks input (weight, or any of the three dimensions), the price is 0 (today's behaviour). Weight 0 gives 0 for the weight base.
- Removals 3–4 m³: 150 → 160 £/m³ (the spreadsheet's tier, per spec). Expected difference, not a bug.
- Price direction = `route` from `transformFormDataToEndpoint.ts`: `shipmentWithAddressService` → `UK-LT`, else `direction`.

## Tasks

### 1. `src/utils/priceCatalog.ts` + vitest
- Add `vitest` to devDependencies, script `"test": "vitest run"`.
- Copy of CMS `lib/price-types.ts` (catalog types only) with the "keep in sync" comment, in both files.
- `priceDirection(service, direction)`, `findCategory`, `findSubCategory`, `pricingFor(category, subCategory)`.
- `categoryOptions(catalog)`, `subCategoryOptions(category)`, `sizeOptions(pricing)`, `specificationOptions(pricing, size)`, `findVariant(pricing, size, specification)`.
- `calculatePrice(pricing, input, direction)` → `{ price: number | null, volume, weight }`; `null` for callManager.
- `src/utils/priceCatalog.test.ts`: cascade, single-option, findVariant, fixed / measured / callManager, parity with old `calculateShipmentPrice` (0, 1, 15, 31 kg; volume tier boundaries) using a fixture built from the CMS export.

### 2. Loading + snapshot
- `src/data/priceCatalog.snapshot.json` (CMS export of 2026-10-11).
- `scripts/update-price-snapshot.mjs`: `GET {VITE_CMS_URL}/api/prices` → snapshot; on failure log a warning and keep the old file. `"prebuild"` runs it.
- `VITE_CMS_URL` in `.env`, typed in `vite-env.d.ts`.
- `getPriceCatalog()` and `usePriceCatalog()` (`@tanstack/react-query`, `staleTime` 5 min, snapshot as `placeholderData`, on error snapshot + `console.warn`).

### 3. Form switch
- `SingleShimpentForm.tsx`, `useCalculatePrice.ts`, `TypeSelect.tsx`, `AmountInput.tsx` read the catalog.
- Keep the `shipments` / `removals` UI branches and ParcelForce (`extent`, limits).

### 4. One-off parity check (stop and show the result)
- Every row of old `products.ts` through the new `calculatePrice`; only `cover/minibuses` and `stove` second `built-in` (→ `freestanding`) may differ. Plus old vs new shipments / removals formulas on a grid.

### 5. Cleanup + i18n (after approval)
- Delete `products.ts`, `convertSizeOptions.ts`, `getOptions.ts`, `shipmentsExlusions.ts`; keep only `extent` in `calculateShipmentPrice.ts`; drop unused enums/types in `types.ts`.
- Key `freestanding`: en «Freestanding», lt «Pastatoma», ru «Отдельностоящая».
- Test: every non-literal catalog label (literals start with `<` or `>`) exists in en / lt / ru.

### 6. Verification
- `npm test`, `npm run type-check`, `npm run lint`, `npm run build`.
- Manual (owner): site against the CMS, each category; then CMS off → snapshot.

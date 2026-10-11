# Prices in Ecotrip CMS — Implementation Plan (Plan 1 of 2: CMS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store parcel prices in Ecotrip CMS (Mongo), edit them on a `/prices` page, update them by importing the price list CSV, and serve them to ecotrip-react through `GET /api/prices`.

**Architecture:** One Mongo document per category holds its subcategories and pricing (`fixed` variants, `measured` tiers, or `callManager`). Pure modules in `lib/` do all logic (Zod schema, CSV parsing, spreadsheet diff, applying import changes, table drafts) and are unit-tested with vitest. Route handlers stay thin and follow the postcodes patterns (`withErrorHandling`, `requireAdmin`, `requireJson`, CORS on public GET). The initial data is generated once from the CSV into `scripts/data/price-catalog.json` and inserted by an insert-only script.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`), React 19, TypeScript, Mongoose 9, Zod 4, papaparse, Clerk, vitest 5, Tailwind 4, base-ui.

**Spec:** `docs/superpowers/specs/2026-10-11-prices-design.md`

**Scope:** this plan covers the CMS only (spec steps 1, 2, 3, 5). Plan 2 (ecotrip-react: `priceCatalog.ts`, snapshot, form switch, parity check, removing `products.ts`) is written after this plan ships, against the real API.

## Global Constraints

- Work in `/Users/artur/Desktop/Projects/Ecotrip CMS`. Node 24.
- Next.js 16 differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (AGENTS.md). Route `params` and page `searchParams` are Promises; middleware is `proxy.ts`.
- Every CMS page calls `requireAdminPage()`. Every write route calls `requireAdmin()` then `requireJson()`.
- Prettier style: double quotes, semicolons, 2 spaces. Run `npm run format` before each commit.
- CMS UI text is English.
- Price directions are exactly `UK-LT` (GBP) and `LT-UK` (EUR). No `LT-LT`.
- Option `value`s keep the ecotrip-react slugs (orders store them). `label` is an i18n key or a literal such as `<R18`.
- Every price is > 0. `upTo` is inclusive; only the last tier may be `null`.
- Zod 4 API (`z.iso.datetime()`, `z.flattenError`). Mongoose 9 (`returnDocument: "after"`).
- Never write to the user's MongoDB (`import:prices -- --write`, browser saves, imports) without the user's explicit OK in chat. `.env.local` points at their database.

Deviations from the spec, agreed during planning:

- The option type is `PriceOption`, not `Node` (`Node` is a DOM global).
- The generated catalog is JSON (`scripts/data/price-catalog.json`), not a `.ts` file.
- The spreadsheet diff lives in `lib/price-diff.ts`, next to the parser `lib/price-sheet.ts`.
- In the `/prices` table a tier's `upTo` is edited in the Weight or Volume column of its basis.

## Review Focus

1. Prices typed with a decimal comma in the CMS table (`70,5`): expect 70.5 saved, not an error. Test: `lib/price-drafts.test.ts` "applies prices typed with a comma" (Task 6).
2. A CSV saved with semicolons, with a BOM, or not in UTF-8: expect it read, or a clear message; never garbage rows. Tests: `lib/price-sheet.test.ts` "parsePriceSheet edge cases" (Task 2).
3. Spreadsheet texts that differ only in case or spaces (`" ratų  KOMPLEKTAS "`): expect the row matched. Tests: `lib/price-diff.test.ts` "lists changed cells with the stored row texts" (Task 3), `lib/price-import.test.ts` "matches rows regardless of case and extra spaces" (Task 8).
4. An empty, zero or text price in the spreadsheet: expect an error line and no change; never a 0 price in the DB. Test: `lib/price-diff.test.ts` "reports unreadable, empty and zero prices" (Task 3).
5. Prices changed (another tab, another import) between the import preview and Apply: expect 409 and nothing written. Test: `lib/price-import.test.ts` "applies nothing when one value changed since the preview" (Task 8).

## File Map

| File | Responsibility |
| --- | --- |
| `lib/price-types.ts` | Catalog types shared with ecotrip-react |
| `lib/price-sheet-key.ts` | Normalized spreadsheet keys; walking and editing variants and tiers |
| `lib/validation/price.ts` | Zod schemas: category, catalog, PUT body, import body |
| `lib/price-test-data.ts` | Small sample catalog for unit tests |
| `lib/price-sheet.ts` | Parse the price list CSV into rows |
| `lib/price-diff.ts` | Compare parsed rows with the catalog |
| `lib/price-import.ts` | Apply import changes all-or-nothing |
| `lib/price-drafts.ts` | Unsaved cell edits of the `/prices` table |
| `lib/prices-client.ts` | Browser calls to the price API |
| `lib/models/price-category.ts` | Mongoose model `PriceCategory` |
| `app/api/prices/route.ts` | `GET /api/prices` (public) |
| `app/api/prices/[category]/route.ts` | `PUT /api/prices/:category` (admin) |
| `app/api/prices/import/route.ts` | `POST /api/prices/import` (admin) |
| `components/prices-table.tsx` | `/prices` table with per-category Save |
| `components/import-prices.tsx` | `/prices/import` file choice, preview, apply |
| `app/(cms)/prices/page.tsx`, `app/(cms)/prices/import/page.tsx` | Pages |
| `components/sidebar.tsx` | "Prices" link |
| `scripts/generate-price-catalog.ts` | CSV → `scripts/data/price-catalog.json` (structure mapping) |
| `scripts/import-prices.ts` | Insert-only seed of `pricecategories` |
| `lib/__fixtures__/pricelist-2026-09-17.csv` | Copy of the price list for tests |

---

### Task 0: Put the CMS under git

The CMS folder is not a git repository yet, so the commit steps below have nowhere to go. Do this task only after the user has said yes to it in chat.

**Files:** none changed. `.gitignore` already excludes `.env*` (except `.env.example`), `node_modules`, `.next`.

- [ ] **Step 1: Check nothing secret would be committed**

Run: `cd "/Users/artur/Desktop/Projects/Ecotrip CMS" && git init && git status --short | grep -i env`
Expected: only `.env.example` is listed.

- [ ] **Step 2: Baseline commit**

```bash
git add -A
git commit -m "chore: baseline before prices section"
```

---

### Task 1: Price types, spreadsheet keys and Zod schema

**Files:**
- Create: `lib/price-types.ts`, `lib/price-sheet-key.ts`, `lib/validation/price.ts`, `lib/price-test-data.ts`
- Test: `lib/price-sheet-key.test.ts`, `lib/validation/price.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - types `Direction`, `Money`, `PriceOption`, `SheetKey`, `Variant`, `Tier`, `FixedPricing`, `MeasuredPricing`, `Pricing`, `SubCategory`, `Category`, `StoredCategory`, `PriceCatalog`, `ChangeField`, `PriceChange`; consts `DIRECTIONS`, `CHANGE_FIELDS`
  - `normalizeSheetText(text: string): string`
  - `sheetKeyId(categorySheet: string, key: SheetKey): string`
  - `type SheetTarget = { kind: "variant"; category: string; item: Variant } | { kind: "tier"; category: string; item: Tier }`
  - `categoryPricings(category: Category): Pricing[]`
  - `sheetTargets(category: Category): SheetTarget[]`
  - `indexSheetTargets(categories: Category[]): Map<string, SheetTarget>`
  - `readTargetField(target, field: ChangeField): number | null | undefined` (undefined: the field does not exist on a tier)
  - `writeTargetField(target, field: ChangeField, value: number | null): boolean`
  - `categorySchema`, `catalogSchema`, `putCategoryBodySchema`, `importBodySchema`, `IMPORT_MAX_CHANGES = 1000`
  - `sampleCatalog(): Category[]` (tests only)

- [ ] **Step 1: Write the types (no behavior, no test of their own)**

Create `lib/price-types.ts`:

```ts
// Price catalog shared by the CMS and ecotrip-react. ecotrip-react keeps a copy
// of these types in src/utils/priceCatalog.ts: change both together.

export const DIRECTIONS = ["UK-LT", "LT-UK"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// UK-LT is charged in GBP, LT-UK in EUR.
export type Money = Record<Direction, number>;

// A Select option on the site. `value` never changes once created (orders
// store it); `label` is an i18n key or a literal such as "<R18".
export type PriceOption = { value: string; label: string };

// Exact texts of one row of the price list spreadsheet. Rows are matched by
// them on import, and the CMS table shows them.
export type SheetKey = { type: string; size: string; spec: string };

export type Variant = {
  sheet: SheetKey;
  size: PriceOption | null;
  specification: PriceOption | null;
  // One item, for logistics only: they do not change the price.
  volume: number | null;
  weight: number | null;
  price: Money;
};

export type Tier = {
  sheet: SheetKey;
  // Inclusive upper limit (kg or m3); null only on the last tier.
  upTo: number | null;
  price: Money;
  // true: price per kg or m3; false: price per parcel.
  perUnit: boolean;
};

export type FixedPricing = { type: "fixed"; variants: Variant[] };

// The price is the larger of the weight price and the volume price.
export type MeasuredPricing = {
  type: "measured";
  byWeight: Tier[] | null;
  byVolume: Tier[] | null;
};

export type Pricing = FixedPricing | MeasuredPricing | { type: "callManager" };

export type SubCategory = PriceOption & { pricing: Pricing };

export type Category = PriceOption & {
  // "Siuntos kategorija" text in the spreadsheet.
  sheet: string;
  order: number;
  // Array order is the Select order. Empty: the site hides Sub Category.
  subCategories: SubCategory[];
  // Set only when subCategories is empty.
  pricing: Pricing | null;
};

// A category as GET /api/prices returns it.
export type StoredCategory = Category & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type PriceCatalog = { categories: StoredCategory[] };

// Fields an import can change. Variants have all four, tiers only prices.
export const CHANGE_FIELDS = [
  "price.UK-LT",
  "price.LT-UK",
  "volume",
  "weight",
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export type PriceChange = {
  category: string;
  sheet: SheetKey;
  field: ChangeField;
  from: number | null;
  to: number | null;
};
```

Create `lib/price-test-data.ts`:

```ts
import type { Category } from "@/lib/price-types";

// Small catalog for unit tests: one fixed subcategory, one measured category.
export function sampleCatalog(): Category[] {
  return [
    {
      value: "shipments",
      label: "shipments",
      sheet: "Siuntos",
      order: 0,
      subCategories: [],
      pricing: {
        type: "measured",
        byWeight: [
          {
            sheet: { type: "", size: "<15 kg", spec: "" },
            upTo: 15,
            price: { "UK-LT": 45, "LT-UK": 45 },
            perUnit: false,
          },
          {
            sheet: { type: "", size: ">15 kg", spec: "" },
            upTo: null,
            price: { "UK-LT": 1.65, "LT-UK": 1.65 },
            perUnit: true,
          },
        ],
        byVolume: null,
      },
    },
    {
      value: "automotiveGoods",
      label: "automotiveGoods",
      sheet: "Automobilių dalys ir priedai",
      order: 1,
      subCategories: [
        {
          value: "setOfWheels",
          label: "setOfWheels",
          pricing: {
            type: "fixed",
            variants: [
              {
                sheet: {
                  type: "Ratų komplektas",
                  size: "<R16",
                  spec: "Be padangų",
                },
                size: { value: "<R16", label: "<R16" },
                specification: { value: "withoutTires", label: "withoutTires" },
                volume: 0.08,
                weight: 28,
                price: { "UK-LT": 66, "LT-UK": 66 },
              },
              {
                sheet: {
                  type: "Ratų komplektas",
                  size: "<R16",
                  spec: "Su padangomis",
                },
                size: { value: "<R16", label: "<R16" },
                specification: { value: "withTires", label: "withTires" },
                volume: 0.24,
                weight: 40,
                price: { "UK-LT": 77, "LT-UK": 77 },
              },
            ],
          },
        },
        {
          value: "interior",
          label: "interior",
          pricing: { type: "callManager" },
        },
      ],
      pricing: null,
    },
  ];
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/price-sheet-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  indexSheetTargets,
  normalizeSheetText,
  readTargetField,
  sheetKeyId,
  sheetTargets,
  writeTargetField,
} from "@/lib/price-sheet-key";
import { sampleCatalog } from "@/lib/price-test-data";

describe("sheet keys", () => {
  it("ignores case and extra spaces", () => {
    expect(normalizeSheetText("  Ratų   Komplektas ")).toBe("ratų komplektas");
    expect(sheetKeyId("Siuntos", { type: "", size: "< 1kg", spec: "" })).toBe(
      sheetKeyId(" siuntos", { type: "", size: "<  1KG", spec: "" }),
    );
  });

  it("lists variants and tiers in table order", () => {
    const [shipments, automotive] = sampleCatalog();
    expect(
      sheetTargets(shipments).map((target) => [
        target.kind,
        target.item.sheet.size,
      ]),
    ).toEqual([
      ["tier", "<15 kg"],
      ["tier", ">15 kg"],
    ]);
    expect(
      sheetTargets(automotive).map((target) => target.item.sheet.spec),
    ).toEqual(["Be padangų", "Su padangomis"]);
  });

  it("reads and writes fields through the index", () => {
    const catalog = sampleCatalog();
    const index = indexSheetTargets(catalog);
    const wheels = index.get(
      sheetKeyId("Automobilių dalys ir priedai", {
        type: "Ratų komplektas",
        size: "<R16",
        spec: "Be padangų",
      }),
    )!;
    const tier = index.get(
      sheetKeyId("Siuntos", { type: "", size: "<15 kg", spec: "" }),
    )!;

    expect(readTargetField(wheels, "weight")).toBe(28);
    expect(readTargetField(tier, "weight")).toBeUndefined();
    expect(writeTargetField(wheels, "price.LT-UK", 70)).toBe(true);
    expect(writeTargetField(tier, "volume", 1)).toBe(false);
    expect(writeTargetField(tier, "price.UK-LT", null)).toBe(false);
    expect(readTargetField(wheels, "price.LT-UK")).toBe(70);
  });
});
```

Create `lib/validation/price.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { sampleCatalog } from "@/lib/price-test-data";
import type {
  Category,
  FixedPricing,
  MeasuredPricing,
} from "@/lib/price-types";
import {
  catalogSchema,
  categorySchema,
  importBodySchema,
  putCategoryBodySchema,
} from "@/lib/validation/price";

function messages(value: unknown) {
  const result = categorySchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

function automotive() {
  return sampleCatalog()[1];
}

function shipments() {
  return sampleCatalog()[0];
}

describe("categorySchema", () => {
  it("has the Category shape", () => {
    // Compile-time check: npm run typecheck fails when the schema and
    // lib/price-types.ts drift apart.
    const fromSchema: Category = sampleCatalog()[0] as z.output<
      typeof categorySchema
    >;
    const toSchema: z.output<typeof categorySchema> = fromSchema;
    expect(toSchema).toBe(fromSchema);
  });

  it("accepts the sample catalog", () => {
    expect(catalogSchema.safeParse(sampleCatalog()).success).toBe(true);
  });

  it("drops unknown fields such as _id", () => {
    const parsed = categorySchema.parse({
      ...automotive(),
      _id: "x",
      updatedAt: "y",
    });
    expect(parsed).not.toHaveProperty("_id");
  });

  it("rejects a repeated size and specification", () => {
    const category = automotive();
    const pricing = category.subCategories[0].pricing as FixedPricing;
    pricing.variants[1].specification = pricing.variants[0].specification;
    pricing.variants[1].sheet.spec = "Other text";
    expect(messages(category)).toContain(
      "Size and specification repeat an earlier row",
    );
  });

  it.each([0, -5])("rejects price %d", (price) => {
    const category = automotive();
    (category.subCategories[0].pricing as FixedPricing).variants[0].price[
      "UK-LT"
    ] = price;
    expect(messages(category)).not.toEqual([]);
  });

  it("rejects tiers out of order and an open tier before the last", () => {
    const outOfOrder = shipments();
    const tiers = (outOfOrder.pricing as MeasuredPricing).byWeight!;
    tiers[1].upTo = 10;
    expect(messages(outOfOrder)).toContain(
      "Each tier must go higher than the one before",
    );

    const openFirst = shipments();
    (openFirst.pricing as MeasuredPricing).byWeight![0].upTo = null;
    expect(messages(openFirst)).toContain(
      "Only the last tier can have no upper limit",
    );
  });

  it("rejects measured pricing without tiers", () => {
    const category = shipments();
    (category.pricing as MeasuredPricing).byWeight = null;
    expect(messages(category)).toContain(
      "Set weight tiers, volume tiers or both",
    );
  });

  it("rejects pricing next to subcategories, and neither", () => {
    expect(
      messages({ ...automotive(), pricing: { type: "callManager" } }),
    ).toContain("Set either subcategories or pricing");
    expect(messages({ ...shipments(), pricing: null })).toContain(
      "Set either subcategories or pricing",
    );
  });

  it("rejects a repeated spreadsheet row", () => {
    const category = automotive();
    const pricing = category.subCategories[0].pricing as FixedPricing;
    pricing.variants[1].sheet = {
      type: "ratų komplektas",
      size: "<R16 ",
      spec: "be padangų",
    };
    expect(messages(category)).toContain(
      "Spreadsheet row repeats: ratų komplektas · <R16 · be padangų",
    );
  });

  it("rejects a repeated category", () => {
    const [first] = sampleCatalog();
    expect(catalogSchema.safeParse([first, first]).success).toBe(false);
  });
});

describe("request bodies", () => {
  it("needs an ISO date in PUT", () => {
    expect(
      putCategoryBodySchema.safeParse({
        category: automotive(),
        updatedAt: "yesterday",
      }).success,
    ).toBe(false);
    expect(
      putCategoryBodySchema.safeParse({
        category: automotive(),
        updatedAt: "2026-10-11T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts import changes with known fields only", () => {
    const change = {
      category: "automotiveGoods",
      sheet: { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" },
      field: "volume",
      from: 0.08,
      to: 0.09,
    };
    expect(importBodySchema.safeParse({ changes: [change] }).success).toBe(
      true,
    );
    expect(
      importBodySchema.safeParse({ changes: [{ ...change, field: "upTo" }] })
        .success,
    ).toBe(false);
    expect(importBodySchema.safeParse({ changes: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/price-sheet-key.test.ts lib/validation/price.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/price-sheet-key"" and the same for `@/lib/validation/price`.

- [ ] **Step 4: Implement**

Create `lib/price-sheet-key.ts`:

```ts
import type {
  Category,
  ChangeField,
  Pricing,
  SheetKey,
  Tier,
  Variant,
} from "@/lib/price-types";

// Spreadsheet texts are compared without regard to case and extra spaces.
export function normalizeSheetText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sheetKeyId(categorySheet: string, key: SheetKey) {
  return [categorySheet, key.type, key.size, key.spec]
    .map(normalizeSheetText)
    .join("|");
}

// A spreadsheet row stored in the catalog: a variant or a tier.
export type SheetTarget =
  | { kind: "variant"; category: string; item: Variant }
  | { kind: "tier"; category: string; item: Tier };

export function categoryPricings(category: Category): Pricing[] {
  return category.pricing
    ? [category.pricing]
    : category.subCategories.map((sub) => sub.pricing);
}

// Every variant and tier of a category, in table order.
export function sheetTargets(category: Category): SheetTarget[] {
  const targets: SheetTarget[] = [];
  for (const pricing of categoryPricings(category)) {
    if (pricing.type === "fixed") {
      for (const item of pricing.variants) {
        targets.push({ kind: "variant", category: category.value, item });
      }
    } else if (pricing.type === "measured") {
      for (const item of [
        ...(pricing.byWeight ?? []),
        ...(pricing.byVolume ?? []),
      ]) {
        targets.push({ kind: "tier", category: category.value, item });
      }
    }
  }
  return targets;
}

// Targets of all categories by sheetKeyId (unique: the schema checks it).
// The items are the catalog's own objects, so writes through them stick.
export function indexSheetTargets(categories: Category[]) {
  const index = new Map<string, SheetTarget>();
  for (const category of categories) {
    for (const target of sheetTargets(category)) {
      index.set(sheetKeyId(category.sheet, target.item.sheet), target);
    }
  }
  return index;
}

export function readTargetField(
  target: SheetTarget,
  field: ChangeField,
): number | null | undefined {
  switch (field) {
    case "price.UK-LT":
      return target.item.price["UK-LT"];
    case "price.LT-UK":
      return target.item.price["LT-UK"];
    case "volume":
      return target.kind === "variant" ? target.item.volume : undefined;
    case "weight":
      return target.kind === "variant" ? target.item.weight : undefined;
  }
}

// Returns false when the field does not exist on the target (volume or weight
// of a tier, or a null price).
export function writeTargetField(
  target: SheetTarget,
  field: ChangeField,
  value: number | null,
) {
  if (field === "price.UK-LT" || field === "price.LT-UK") {
    if (value === null) {
      return false;
    }
    target.item.price[field === "price.UK-LT" ? "UK-LT" : "LT-UK"] = value;
    return true;
  }
  if (target.kind !== "variant") {
    return false;
  }
  target.item[field] = value;
  return true;
}
```

Create `lib/validation/price.ts`:

```ts
import { z } from "zod";
import { sheetKeyId, sheetTargets } from "@/lib/price-sheet-key";
import { CHANGE_FIELDS } from "@/lib/price-types";

const text = z.string().trim().min(1);

const optionSchema = z.object({ value: text, label: text });

const sheetKeySchema = z.object({
  type: z.string().trim(),
  size: z.string().trim(),
  spec: z.string().trim(),
});

const moneySchema = z.object({
  "UK-LT": z.number().positive(),
  "LT-UK": z.number().positive(),
});

const measureSchema = z.number().nonnegative().nullable();

const variantSchema = z.object({
  sheet: sheetKeySchema,
  size: optionSchema.nullable(),
  specification: optionSchema.nullable(),
  volume: measureSchema,
  weight: measureSchema,
  price: moneySchema,
});

const tierSchema = z.object({
  sheet: sheetKeySchema,
  upTo: z.number().positive().nullable(),
  price: moneySchema,
  perUnit: z.boolean(),
});

const tiersSchema = z
  .array(tierSchema)
  .min(1)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      if (tier.upTo === null && index < tiers.length - 1) {
        ctx.addIssue({
          code: "custom",
          message: "Only the last tier can have no upper limit",
          path: [index, "upTo"],
        });
      }
      const previous = tiers[index - 1]?.upTo;
      if (
        tier.upTo !== null &&
        previous !== undefined &&
        previous !== null &&
        tier.upTo <= previous
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Each tier must go higher than the one before",
          path: [index, "upTo"],
        });
      }
    });
  });

const pricingSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("fixed"),
      variants: z.array(variantSchema).min(1),
    }),
    z.object({
      type: z.literal("measured"),
      byWeight: tiersSchema.nullable(),
      byVolume: tiersSchema.nullable(),
    }),
    z.object({ type: z.literal("callManager") }),
  ])
  .superRefine((pricing, ctx) => {
    if (pricing.type === "measured") {
      if (pricing.byWeight === null && pricing.byVolume === null) {
        ctx.addIssue({
          code: "custom",
          message: "Set weight tiers, volume tiers or both",
        });
      }
    }
    if (pricing.type === "fixed") {
      const seen = new Set<string>();
      pricing.variants.forEach((variant, index) => {
        const key = `${variant.size?.value ?? ""}|${variant.specification?.value ?? ""}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: "Size and specification repeat an earlier row",
            path: ["variants", index],
          });
        }
        seen.add(key);
      });
    }
  });

const subCategorySchema = optionSchema.extend({ pricing: pricingSchema });

export const categorySchema = optionSchema
  .extend({
    sheet: text,
    order: z.number().int().nonnegative(),
    subCategories: z.array(subCategorySchema),
    pricing: pricingSchema.nullable(),
  })
  .superRefine((category, ctx) => {
    if (category.subCategories.length > 0 === (category.pricing !== null)) {
      ctx.addIssue({
        code: "custom",
        message: "Set either subcategories or pricing",
        path: ["pricing"],
      });
    }

    const values = new Set<string>();
    category.subCategories.forEach((sub, index) => {
      if (values.has(sub.value)) {
        ctx.addIssue({
          code: "custom",
          message: `Subcategory "${sub.value}" repeats`,
          path: ["subCategories", index, "value"],
        });
      }
      values.add(sub.value);
    });

    const rows = new Set<string>();
    for (const target of sheetTargets(category)) {
      const id = sheetKeyId(category.sheet, target.item.sheet);
      if (rows.has(id)) {
        const { type, size, spec } = target.item.sheet;
        ctx.addIssue({
          code: "custom",
          message: `Spreadsheet row repeats: ${[type, size, spec].filter(Boolean).join(" · ")}`,
          path: ["subCategories"],
        });
      }
      rows.add(id);
    }
  });

export const catalogSchema = z
  .array(categorySchema)
  .superRefine((categories, ctx) => {
    const values = new Set<string>();
    categories.forEach((category, index) => {
      if (values.has(category.value)) {
        ctx.addIssue({
          code: "custom",
          message: `Category "${category.value}" repeats`,
          path: [index, "value"],
        });
      }
      values.add(category.value);
    });
  });

// PUT /api/prices/:category. `updatedAt` is the version the client read.
export const putCategoryBodySchema = z.object({
  category: categorySchema,
  updatedAt: z.iso.datetime(),
});

export const IMPORT_MAX_CHANGES = 1000;

// POST /api/prices/import
export const importBodySchema = z.object({
  changes: z
    .array(
      z.object({
        category: text,
        sheet: sheetKeySchema,
        field: z.enum(CHANGE_FIELDS),
        from: z.number().nullable(),
        to: z.number().nullable(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_CHANGES),
});
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run lib/price-sheet-key.test.ts lib/validation/price.test.ts && npm run typecheck`
Expected: PASS (16 tests), no type errors. The "has the Category shape" test is a compile-time check: `npm run typecheck` fails if the schema and `lib/price-types.ts` drift apart.

- [ ] **Step 6: Commit**

```bash
npm run format
git add lib/price-types.ts lib/price-sheet-key.ts lib/validation/price.ts lib/price-test-data.ts lib/price-sheet-key.test.ts lib/validation/price.test.ts
git commit -m "feat(prices): catalog types, spreadsheet keys and schema"
```

---

### Task 2: Price list CSV parser

**Files:**
- Create: `lib/price-sheet.ts`, `lib/__fixtures__/pricelist-2026-09-17.csv`
- Test: `lib/price-sheet.test.ts`

**Interfaces:**
- Consumes: `normalizeSheetText` (Task 1)
- Produces:
  - `SHEET_MAX_BYTES = 1024 * 1024`, `SHIPMENTS_SHEET = "Siuntos"`
  - `type SheetCells = { volume: string; weight: string; gbp: string; eur: string }`
  - `type SheetRow = { line: number; category: string; type: string; size: string; spec: string; cells: SheetCells }`
  - `parsePriceSheet(text: string): { rows: SheetRow[]; error: string | null }`
  - `parseSheetNumber(cell: string): number | null | "invalid"`

- [ ] **Step 1: Add the fixture**

Run: `mkdir -p lib/__fixtures__ && cp "/Users/artur/Downloads/Ecotrip pricelist - Copy of Visos kategorijos nuo 2026-09-17.csv" lib/__fixtures__/pricelist-2026-09-17.csv`
Expected: the file exists, 220 lines.

- [ ] **Step 2: Write the failing test**

Create `lib/price-sheet.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePriceSheet, parseSheetNumber } from "@/lib/price-sheet";

const fixture = readFileSync(
  new URL("./__fixtures__/pricelist-2026-09-17.csv", import.meta.url),
  "utf8",
);

const HEADER =
  ",Siuntos kategorija,Siuntos tipas,Dydis,Dydžio patikslinimas,Tūris (m3),Svoris (kg),Kaina iš UK  į  LT (GBP),Kaina iš LT į UK (EUR),Kaina LT-LT";

describe("parsePriceSheet on the 2026-09-17 spreadsheet", () => {
  const { rows, error } = parsePriceSheet(fixture);

  it("reads every price row", () => {
    expect(error).toBeNull();
    expect(rows).toHaveLength(175);
  });

  it("puts the rows above the first category into Siuntos", () => {
    expect(rows[0]).toEqual({
      line: 3,
      category: "Siuntos",
      type: "",
      size: "< 1kg",
      spec: "",
      cells: { volume: "", weight: "", gbp: "35", eur: "35" },
    });
  });

  it("repeats category and type from the rows above", () => {
    expect(rows.find((row) => row.line === 14)).toEqual({
      line: 14,
      category: "Automobilių dalys ir priedai",
      type: "Ratų komplektas",
      size: "<R18",
      spec: "Be padangų",
      cells: { volume: "0.1", weight: "32", gbp: "88", eur: "88" },
    });
    expect(rows.find((row) => row.line === 172)?.type).toBe("");
  });

  it("skips rows the site does not use", () => {
    const sizes = rows.map((row) => row.size.toLowerCase());
    expect(sizes).not.toContain("arba");
    expect(sizes).not.toContain("susisiekti su vadybininku");
    expect(rows.some((row) => row.category === "Kita")).toBe(false);
    expect(rows.some((row) => row.category === "Paletės")).toBe(false);
    expect(
      rows
        .filter((row) => row.category === "Prekės vaikams")
        .map((row) => row.type),
    ).not.toContain("Vaikiška dviračio priekaba");
    expect(Math.max(...rows.map((row) => row.line))).toBe(202);
  });
});

describe("parsePriceSheet edge cases", () => {
  it("reads semicolon-separated files and strips the BOM", () => {
    const csv = `﻿${HEADER.replaceAll(",", ";")}\n;Paletės;Kita tipas;<1 m3;;0,5;10;1,5;2;\n`;
    const { rows, error } = parsePriceSheet(csv);
    expect(error).toBeNull();
    expect(rows[0].cells).toEqual({
      volume: "0,5",
      weight: "10",
      gbp: "1,5",
      eur: "2",
    });
  });

  it("finds price columns whatever the spacing of the header", () => {
    const header = HEADER.replace(
      "Kaina iš UK  į  LT (GBP)",
      "kaina iš UK į LT (gbp)",
    );
    const { rows, error } = parsePriceSheet(`${header}\n,,,<1kg,,,,35,36,15\n`);
    expect(error).toBeNull();
    expect(rows[0].cells.gbp).toBe("35");
    expect(rows[0].cells.eur).toBe("36");
  });

  it("explains files it cannot read", () => {
    expect(parsePriceSheet("a,b\n1,2\n").error).toBe(
      'Header row with "Siuntos kategorija" not found.',
    );
    expect(parsePriceSheet(`${HEADER.replace("Dydis", "Size")}\n`).error).toBe(
      'Column "Dydis" not found in the header row.',
    );
    expect(parsePriceSheet(`${HEADER}\n,Siuntos kategorija �\n`).error).toMatch(
      /not UTF-8/,
    );
    expect(parsePriceSheet(`${HEADER}\n,,,,,,,,,\n`).error).toBe(
      "The file has no price rows.",
    );
  });
});

describe("parseSheetNumber", () => {
  it.each([
    ["35", 35],
    ["0.035", 0.035],
    ["1,65 gbp/kg", 1.65],
    ["230 m3", 230],
    [" 90 ", 90],
    ["", null],
    ["pagal kg", "invalid"],
    ["skaičiuojama pagal m3", "invalid"],
  ])("reads %j as %j", (cell, expected) => {
    expect(parseSheetNumber(cell)).toBe(expected);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run lib/price-sheet.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/price-sheet"".

- [ ] **Step 4: Implement**

Create `lib/price-sheet.ts`:

```ts
import Papa from "papaparse";
import { normalizeSheetText } from "@/lib/price-sheet-key";

export const SHEET_MAX_BYTES = 1024 * 1024;

// Category of the rows above the first named category: parcels.
export const SHIPMENTS_SHEET = "Siuntos";

export type SheetCells = {
  volume: string;
  weight: string;
  gbp: string;
  eur: string;
};

export type SheetRow = {
  // Row number in the spreadsheet (the same as the line in the CSV file).
  line: number;
  category: string;
  type: string;
  size: string;
  spec: string;
  cells: SheetCells;
};

export type ParsedSheet = { rows: SheetRow[]; error: string | null };

type Column = "category" | "type" | "size" | "spec" | keyof SheetCells;

// How each column is found in the header row (texts are normalized).
const COLUMNS: {
  column: Column;
  name: string;
  matches: (header: string) => boolean;
}[] = [
  {
    column: "category",
    name: "Siuntos kategorija",
    matches: (h) => h === "siuntos kategorija",
  },
  {
    column: "type",
    name: "Siuntos tipas",
    matches: (h) => h === "siuntos tipas",
  },
  { column: "size", name: "Dydis", matches: (h) => h === "dydis" },
  {
    column: "spec",
    name: "Dydžio patikslinimas",
    matches: (h) => h === "dydžio patikslinimas",
  },
  {
    column: "volume",
    name: "Tūris (m3)",
    matches: (h) => h.startsWith("tūris"),
  },
  {
    column: "weight",
    name: "Svoris (kg)",
    matches: (h) => h.startsWith("svoris"),
  },
  {
    column: "gbp",
    name: "Kaina iš UK į LT (GBP)",
    matches: (h) => h.includes("gbp"),
  },
  {
    column: "eur",
    name: "Kaina iš LT į UK (EUR)",
    matches: (h) => h.includes("eur"),
  },
];

// Everything from this category down (service fees, discounts) is not prices.
const STOP_CATEGORY = "paslaugų įkainiai";
const CONTACT_MANAGER = "susisiekti su vadybininku";
const OR_ROW = "arba";

// Spreadsheet rows the site does not use.
const IGNORED_ROWS: { category: string; type?: string }[] = [
  { category: "kita" },
  { category: "prekės vaikams", type: "vaikiška dviračio priekaba" },
];

function isSkipped(row: SheetRow) {
  if (
    [row.size, row.spec, ...Object.values(row.cells)].every((cell) => !cell)
  ) {
    return true;
  }

  const category = normalizeSheetText(row.category);
  const type = normalizeSheetText(row.type);
  const size = normalizeSheetText(row.size);

  return (
    type === CONTACT_MANAGER ||
    size === CONTACT_MANAGER ||
    size === OR_ROW ||
    IGNORED_ROWS.some(
      (rule) =>
        rule.category === category &&
        (rule.type === undefined || rule.type === type),
    )
  );
}

/**
 * Reads the price list exported from Google Sheets as CSV. Empty category and
 * type cells repeat the value above them, the way the spreadsheet is laid out.
 */
export function parsePriceSheet(text: string): ParsedSheet {
  const fail = (error: string): ParsedSheet => ({ rows: [], error });

  if (text.includes("�")) {
    return fail(
      'The file is not UTF-8. In Google Sheets use File → Download → "Comma-separated values (.csv)".',
    );
  }

  // The delimiter (comma or semicolon) is detected automatically.
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""));

  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    return fail(
      `Broken quotes in row ${(quoteError.row ?? 0) + 1}: ${quoteError.message}`,
    );
  }

  const lines = result.data;
  const headerIndex = lines.findIndex((cells) =>
    cells.some((cell) => normalizeSheetText(cell) === "siuntos kategorija"),
  );
  if (headerIndex === -1) {
    return fail('Header row with "Siuntos kategorija" not found.');
  }

  const header = lines[headerIndex].map(normalizeSheetText);
  const positions = {} as Record<Column, number>;
  for (const { column, name, matches } of COLUMNS) {
    const position = header.findIndex(matches);
    if (position === -1) {
      return fail(`Column "${name}" not found in the header row.`);
    }
    positions[column] = position;
  }

  const rows: SheetRow[] = [];
  let category = SHIPMENTS_SHEET;
  let type = "";

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cell = (column: Column) =>
      (lines[index][positions[column]] ?? "").trim();

    if (normalizeSheetText(cell("category")).startsWith(STOP_CATEGORY)) {
      break;
    }
    if (cell("category")) {
      category = cell("category");
      type = "";
    }
    if (cell("type")) {
      type = cell("type");
    }

    const row: SheetRow = {
      line: index + 1,
      category,
      type,
      size: cell("size"),
      spec: cell("spec"),
      cells: {
        volume: cell("volume"),
        weight: cell("weight"),
        gbp: cell("gbp"),
        eur: cell("eur"),
      },
    };
    if (!isSkipped(row)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return fail("The file has no price rows.");
  }

  return { rows, error: null };
}

export type SheetNumber = number | null | "invalid";

// "35" → 35, "1,65 gbp/kg" → 1.65, "230 m3" → 230, "" → null.
export function parseSheetNumber(cell: string): SheetNumber {
  const text = cell.trim();
  if (!text) {
    return null;
  }
  const match = /^\d+(?:[.,]\d+)?/.exec(text);
  return match ? Number(match[0].replace(",", ".")) : "invalid";
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/price-sheet.test.ts`
Expected: PASS (15 tests). The fixture yields 175 rows: 157 variants and 18 tiers.

- [ ] **Step 6: Commit**

```bash
npm run format
git add lib/price-sheet.ts lib/price-sheet.test.ts lib/__fixtures__/pricelist-2026-09-17.csv
git commit -m "feat(prices): parse the price list CSV"
```

---

### Task 3: Spreadsheet diff

**Files:**
- Create: `lib/price-diff.ts`
- Test: `lib/price-diff.test.ts`

**Interfaces:**
- Consumes: `indexSheetTargets`, `readTargetField`, `sheetKeyId`, `sheetTargets` (Task 1); `parseSheetNumber`, `SheetRow`, `SheetCells` (Task 2)
- Produces:
  - `type SheetChange = PriceChange & { line: number }`
  - `type MissingRow = { category: string; categorySheet: string; sheet: SheetKey }`
  - `type SheetDiff = { changes: SheetChange[]; unknown: SheetRow[]; missing: MissingRow[]; errors: { line: number; message: string }[] }`
  - `FIELD_LABELS: Record<ChangeField, string>`
  - `diffPriceSheet(categories: Category[], rows: SheetRow[]): SheetDiff` — changes carry the catalog's stored `sheet` texts, so the server matches them exactly.

- [ ] **Step 1: Write the failing test**

Create `lib/price-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffPriceSheet } from "@/lib/price-diff";
import type { SheetRow } from "@/lib/price-sheet";
import { sampleCatalog } from "@/lib/price-test-data";

function wheelsRow(
  patch: Partial<SheetRow> = {},
  cells: Partial<SheetRow["cells"]> = {},
): SheetRow {
  return {
    line: 13,
    category: "Automobilių dalys ir priedai",
    type: "Ratų komplektas",
    size: "<R16",
    spec: "Be padangų",
    ...patch,
    cells: { volume: "0.08", weight: "28", gbp: "66", eur: "66", ...cells },
  };
}

function tierRow(size: string, gbp: string, line: number): SheetRow {
  return {
    line,
    category: "Siuntos",
    type: "",
    size,
    spec: "",
    cells: { volume: "", weight: "skaičiuojama pagal m3", gbp, eur: gbp },
  };
}

const allRows = () => [
  tierRow("<15 kg", "45", 3),
  tierRow(">15 kg", "1,65 gbp/kg", 4),
  wheelsRow(),
  wheelsRow(
    { line: 14, spec: "Su padangomis" },
    { volume: "0.24", weight: "40", gbp: "77", eur: "77" },
  ),
];

describe("diffPriceSheet", () => {
  it("finds nothing when the spreadsheet matches", () => {
    expect(diffPriceSheet(sampleCatalog(), allRows())).toEqual({
      changes: [],
      unknown: [],
      missing: [],
      errors: [],
    });
  });

  it("lists changed cells with the stored row texts", () => {
    const rows = allRows();
    rows[2] = wheelsRow(
      { type: " ratų  KOMPLEKTAS " },
      { gbp: "70", weight: "" },
    );
    const diff = diffPriceSheet(sampleCatalog(), rows);
    const sheet = { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" };
    expect(diff.changes).toEqual([
      {
        line: 13,
        category: "automotiveGoods",
        sheet,
        field: "price.UK-LT",
        from: 66,
        to: 70,
      },
      {
        line: 13,
        category: "automotiveGoods",
        sheet,
        field: "weight",
        from: 28,
        to: null,
      },
    ]);
    expect(diff.errors).toEqual([]);
  });

  it("splits unknown and missing rows", () => {
    const rows = allRows().slice(0, 3);
    rows.push(wheelsRow({ line: 20, size: "<R18" }));
    const diff = diffPriceSheet(sampleCatalog(), rows);
    expect(diff.unknown.map((row) => row.line)).toEqual([20]);
    expect(diff.missing).toEqual([
      {
        category: "automotiveGoods",
        categorySheet: "Automobilių dalys ir priedai",
        sheet: { type: "Ratų komplektas", size: "<R16", spec: "Su padangomis" },
      },
    ]);
  });

  it("reports unreadable, empty and zero prices instead of changing them", () => {
    const rows = allRows();
    rows[2] = wheelsRow({}, { gbp: "abc", eur: "" });
    rows[3] = wheelsRow(
      { line: 14, spec: "Su padangomis" },
      { volume: "0.24", weight: "40", gbp: "0", eur: "77" },
    );
    const diff = diffPriceSheet(sampleCatalog(), rows);
    expect(diff.changes).toEqual([]);
    expect(diff.errors).toEqual([
      { line: 13, message: 'UK→LT (£): "abc" is not a number' },
      { line: 13, message: "LT→UK (€): price must be greater than 0" },
      { line: 14, message: "UK→LT (£): price must be greater than 0" },
    ]);
  });

  it("reports a row that appears twice", () => {
    const rows = [...allRows(), wheelsRow({ line: 30 })];
    expect(diffPriceSheet(sampleCatalog(), rows).errors).toEqual([
      { line: 30, message: "Repeats row 13" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/price-diff.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/price-diff"".

- [ ] **Step 3: Implement**

Create `lib/price-diff.ts`:

```ts
import {
  indexSheetTargets,
  readTargetField,
  sheetKeyId,
  sheetTargets,
} from "@/lib/price-sheet-key";
import {
  parseSheetNumber,
  type SheetCells,
  type SheetRow,
} from "@/lib/price-sheet";
import type {
  Category,
  ChangeField,
  PriceChange,
  SheetKey,
} from "@/lib/price-types";

export type SheetChange = PriceChange & { line: number };

export type MissingRow = {
  category: string;
  categorySheet: string;
  sheet: SheetKey;
};

export type SheetDiff = {
  changes: SheetChange[];
  // Spreadsheet rows with no match in the CMS.
  unknown: SheetRow[];
  // CMS rows with no match in the spreadsheet.
  missing: MissingRow[];
  errors: { line: number; message: string }[];
};

export const FIELD_LABELS: Record<ChangeField, string> = {
  "price.UK-LT": "UK→LT (£)",
  "price.LT-UK": "LT→UK (€)",
  volume: "Volume (m³)",
  weight: "Weight (kg)",
};

const FIELD_CELLS: {
  field: ChangeField;
  cell: keyof SheetCells;
  price: boolean;
}[] = [
  { field: "price.UK-LT", cell: "gbp", price: true },
  { field: "price.LT-UK", cell: "eur", price: true },
  { field: "volume", cell: "volume", price: false },
  { field: "weight", cell: "weight", price: false },
];

/**
 * Compares the spreadsheet with the catalog. Tiers compare prices only; their
 * volume and weight cells hold notes ("skaičiuojama pagal m3").
 */
export function diffPriceSheet(
  categories: Category[],
  rows: SheetRow[],
): SheetDiff {
  const index = indexSheetTargets(categories);
  const seen = new Map<string, number>();
  const diff: SheetDiff = { changes: [], unknown: [], missing: [], errors: [] };

  for (const row of rows) {
    const id = sheetKeyId(row.category, row);
    const target = index.get(id);
    if (!target) {
      diff.unknown.push(row);
      continue;
    }

    const firstLine = seen.get(id);
    if (firstLine !== undefined) {
      diff.errors.push({ line: row.line, message: `Repeats row ${firstLine}` });
      continue;
    }
    seen.set(id, row.line);

    for (const { field, cell, price } of FIELD_CELLS) {
      if (!price && target.kind !== "variant") {
        continue;
      }

      const raw = row.cells[cell];
      const value = parseSheetNumber(raw);
      const label = FIELD_LABELS[field];
      if (value === "invalid") {
        diff.errors.push({
          line: row.line,
          message: `${label}: "${raw}" is not a number`,
        });
        continue;
      }
      if (price && (value === null || value <= 0)) {
        diff.errors.push({
          line: row.line,
          message: `${label}: price must be greater than 0`,
        });
        continue;
      }

      const current = readTargetField(target, field);
      if (current !== undefined && value !== current) {
        diff.changes.push({
          line: row.line,
          category: target.category,
          sheet: target.item.sheet,
          field,
          from: current,
          to: value,
        });
      }
    }
  }

  for (const category of categories) {
    for (const target of sheetTargets(category)) {
      if (!seen.has(sheetKeyId(category.sheet, target.item.sheet))) {
        diff.missing.push({
          category: category.value,
          categorySheet: category.sheet,
          sheet: target.item.sheet,
        });
      }
    }
  }

  return diff;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/price-diff.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add lib/price-diff.ts lib/price-diff.test.ts
git commit -m "feat(prices): compare the price list with the catalog"
```

---

### Task 4: Generate the initial catalog from the price list

The generator maps spreadsheet texts to the ecotrip-react slugs and applies the agreed fixes (spec, section "Сверка таблицы и `products.ts`"). Fixes that come for free from the spreadsheet: `cover/minibuses` 90, `stove/freestanding` 80, engine `<1000 cm3`, wheel sizes `<R16 <R18 <R22 >R22`, `umbrella` volume 0.08, small tractor volume 0.8, swapped gearbox volume and weight. Fixes the generator applies itself: gearbox volume 0.4 → 0.04 (two rows), chopper size label `>1200 cm3`.

**Files:**
- Create: `scripts/generate-price-catalog.ts`, `scripts/data/price-catalog.json` (generated)
- Test: `lib/price-catalog.test.ts`

**Interfaces:**
- Consumes: `parsePriceSheet`, `parseSheetNumber` (Task 2), `diffPriceSheet` (Task 3), `catalogSchema` (Task 1)
- Produces: `scripts/data/price-catalog.json`: a `Category[]` of 10 categories in this order: `shipments`, `automotiveGoods`, `householdAppliances`, `bicyclesAndScooters`, `motorcyclesAndAccessories`, `palettes`, `removals`, `flatScreenTv`, `goodsForChildren`, `gardenEquipment`.

- [ ] **Step 1: Write the failing test**

Create `lib/price-catalog.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffPriceSheet } from "@/lib/price-diff";
import { parsePriceSheet } from "@/lib/price-sheet";
import type {
  Category,
  FixedPricing,
  MeasuredPricing,
} from "@/lib/price-types";
import { catalogSchema } from "@/lib/validation/price";

const catalog = JSON.parse(
  readFileSync(
    new URL("../scripts/data/price-catalog.json", import.meta.url),
    "utf8",
  ),
) as Category[];
const sheet = readFileSync(
  new URL("./__fixtures__/pricelist-2026-09-17.csv", import.meta.url),
  "utf8",
);

const category = (value: string) =>
  catalog.find((item) => item.value === value)!;
const fixedOf = (categoryValue: string, sub?: string) =>
  (sub
    ? category(categoryValue).subCategories.find((item) => item.value === sub)!
        .pricing
    : category(categoryValue).pricing) as FixedPricing;
const measuredOf = (categoryValue: string, sub?: string) =>
  (sub
    ? category(categoryValue).subCategories.find((item) => item.value === sub)!
        .pricing
    : category(categoryValue).pricing) as MeasuredPricing;

describe("price catalog", () => {
  it("passes the schema", () => {
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
  });

  it("keeps the category order of the spreadsheet", () => {
    expect(catalog.map((item) => item.value)).toEqual([
      "shipments",
      "automotiveGoods",
      "householdAppliances",
      "bicyclesAndScooters",
      "motorcyclesAndAccessories",
      "palettes",
      "removals",
      "flatScreenTv",
      "goodsForChildren",
      "gardenEquipment",
    ]);
  });

  it("matches the 2026-09-17 spreadsheet except the two fixed gearbox volumes", () => {
    const parsed = parsePriceSheet(sheet);
    const diff = diffPriceSheet(catalog, parsed.rows);
    expect(diff.unknown).toEqual([]);
    expect(diff.missing).toEqual([]);
    expect(diff.errors).toEqual([]);
    expect(
      diff.changes.map(({ sheet, field, from, to }) => ({
        ...sheet,
        field,
        from,
        to,
      })),
    ).toEqual([
      {
        type: "Pavarų dėžė",
        size: "<2000 cm3",
        spec: "Mechaninė",
        field: "volume",
        from: 0.04,
        to: 0.4,
      },
      {
        type: "Pavarų dėžė",
        size: "<2500 cm3",
        spec: "Automatinė",
        field: "volume",
        from: 0.04,
        to: 0.4,
      },
    ]);
  });

  it("carries the agreed data fixes", () => {
    const minibus = fixedOf("automotiveGoods", "cover").variants.find(
      (v) => v.size?.value === "minibuses",
    )!;
    expect(minibus.price).toEqual({ "UK-LT": 90, "LT-UK": 90 });

    expect(
      fixedOf("householdAppliances", "stove").variants.map((v) => [
        v.size?.value,
        v.price["LT-UK"],
      ]),
    ).toEqual([
      ["built-in", 65],
      ["freestanding", 80],
      ["withBurners", 100],
    ]);

    expect(fixedOf("automotiveGoods", "engine").variants[0].size).toEqual({
      value: "<1000 cm3",
      label: "<1000 cm3",
    });

    const wheelSizes = fixedOf("automotiveGoods", "setOfWheels").variants.map(
      (v) => v.size?.label,
    );
    expect([...new Set(wheelSizes)]).toEqual(["<R16", "<R18", "<R22", ">R22"]);

    const chopper = fixedOf("motorcyclesAndAccessories", "chopper").variants.at(
      -1,
    )!;
    expect(chopper.sheet.size).toBe("1200 cm3");
    expect(chopper.size?.label).toBe(">1200 cm3");

    const umbrella = fixedOf("goodsForChildren", "strollers").variants.find(
      (v) => v.size?.value === "umbrella",
    )!;
    expect(umbrella.volume).toBe(0.08);

    expect(
      category("goodsForChildren").subCategories.map((sub) => sub.value),
    ).toEqual(["childSeat", "strollers"]);
  });

  it("describes formula prices as tiers", () => {
    const shipments = measuredOf("shipments");
    expect(
      shipments.byWeight?.map((t) => [t.upTo, t.price["UK-LT"], t.perUnit]),
    ).toEqual([
      [1, 35, false],
      [15, 45, false],
      [30, 50, false],
      [null, 1.65, true],
    ]);
    expect(shipments.byVolume?.map((t) => [t.upTo, t.price["LT-UK"]])).toEqual([
      [0.16, 230],
      [0.31, 220],
      [0.47, 210],
      [0.63, 205],
      [null, 200],
    ]);
    expect(
      measuredOf("removals").byVolume?.map((t) => [t.upTo, t.price["LT-UK"]]),
    ).toEqual([
      [1, 200],
      [2, 185],
      [3, 170],
      [4, 160],
      [5, 150],
      [10, 130],
      [null, 115],
    ]);
    expect(measuredOf("householdAppliances", "fridge").byVolume).toEqual([
      {
        sheet: { type: "Šaldytuvas", size: "Išmatavimai", spec: "" },
        upTo: null,
        price: { "UK-LT": 200, "LT-UK": 200 },
        perUnit: true,
      },
    ]);
    expect(category("palettes").pricing).toEqual({ type: "callManager" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/price-catalog.test.ts`
Expected: FAIL, "ENOENT: no such file or directory ... price-catalog.json".

- [ ] **Step 3: Write the generator**

Create `scripts/generate-price-catalog.ts`:

```ts
/**
 * Builds scripts/data/price-catalog.json from the price list CSV:
 *
 *   npx tsx scripts/generate-price-catalog.ts "<path to the CSV>"
 *
 * Structure, values and labels come from MAPPING below (they match
 * ecotrip-react src/utils/products.ts, so orders keep their format). Numbers
 * come from the CSV. The script fails on any row it cannot place, and the
 * result must pass catalogSchema before it is written.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeSheetText } from "@/lib/price-sheet-key";
import {
  parsePriceSheet,
  parseSheetNumber,
  type SheetRow,
} from "@/lib/price-sheet";
import type {
  Category,
  Money,
  Pricing,
  PriceOption,
  SubCategory,
  Tier,
  Variant,
} from "@/lib/price-types";
import { catalogSchema } from "@/lib/validation/price";

const OUTPUT = path.join(
  process.cwd(),
  "scripts",
  "data",
  "price-catalog.json",
);

// undefined: the text is not known, the script stops.
type OptionRule = (text: string) => PriceOption | null | undefined;

const option = (value: string, label = value): PriceOption => ({
  value,
  label,
});

// Text → option with the same value and label (a literal like "<R18").
const literal =
  (transform: (text: string) => string = (text) => text): OptionRule =>
  (text) =>
    text ? option(transform(text)) : undefined;

// Text → one of the listed options (i18n keys).
const pick =
  (options: Record<string, string>): OptionRule =>
  (text) => {
    const value = Object.entries(options).find(
      ([sheet]) => normalizeSheetText(sheet) === normalizeSheetText(text),
    )?.[1];
    return value === undefined ? undefined : option(value);
  };

const none: OptionRule = () => null;

type TierRule = { size: string; upTo: number | null; perUnit: boolean };

type PricingRule =
  | { type: "fixed"; size: OptionRule; spec: OptionRule }
  | {
      type: "measured";
      byWeight: TierRule[] | null;
      byVolume: TierRule[] | null;
    }
  | { type: "callManager" };

// `types`: "Siuntos tipas" texts of the subcategory ("" for a category without subcategories).
type SubRule = { value: string; types: string[]; pricing: PricingRule };

type CategoryRule = {
  value: string;
  sheet: string;
  subCategories: SubRule[];
  // Pricing of a category without subcategories (its rows have an empty type).
  pricing?: PricingRule;
};

const fixed = (size: OptionRule, spec: OptionRule = none): PricingRule => ({
  type: "fixed",
  size,
  spec,
});
const callManager: PricingRule = { type: "callManager" };
const perCubicMetre = (size: string): PricingRule => ({
  type: "measured",
  byWeight: null,
  byVolume: [{ size, upTo: null, perUnit: true }],
});

const carSizes = pick({
  "Mikro automobiliai, pvz Fiat 500": "microCars",
  "Subkompaktiniai automobiliai, pvz VW Polo": "subcompactCars",
  "Kompaktiniai automobiliai, pvz VW Golf": "compactCars",
  "Vidutinio dydžio automobiliai, pvz VW Passat": "midSizeCars",
  "Dideli automobiliai, pvz MB S klasė": "bigCars",
  "Visureigiai, pvz BMW X5": "suvs",
  "Pikapai, pvz Ford Ranger": "pickupTrucks",
  "Mikroautobusai, pvz VW Caravelle": "minibuses",
});
const bikeSizes = pick({
  "Pilnai surinktas": "fullyAssembled",
  "Išardytas (nuimti ratai ir pedalai)": "dismantled",
});
const tractorSizes = literal((text) =>
  text.replace(/^Pjovimo skersmuo\s*/, ""),
);
const tractorSpecs = pick({
  "Be surinkimo krepšio": "withoutAssemblyBag",
  "Su surinkimo krepšiu": "withAssemblyBag",
});

const MAPPING: CategoryRule[] = [
  {
    value: "shipments",
    sheet: "Siuntos",
    subCategories: [],
    pricing: {
      type: "measured",
      byWeight: [
        { size: "< 1kg", upTo: 1, perUnit: false },
        { size: "<15 kg", upTo: 15, perUnit: false },
        { size: "<30 kg", upTo: 30, perUnit: false },
        { size: ">30 kg", upTo: null, perUnit: true },
      ],
      byVolume: [
        { size: "<0.16", upTo: 0.16, perUnit: true },
        { size: "<0.31", upTo: 0.31, perUnit: true },
        { size: "<0.47", upTo: 0.47, perUnit: true },
        { size: "<0.63", upTo: 0.63, perUnit: true },
        { size: "0.63+", upTo: null, perUnit: true },
      ],
    },
  },
  {
    value: "automotiveGoods",
    sheet: "Automobilių dalys ir priedai",
    subCategories: [
      {
        value: "setOfWheels",
        types: ["Ratų komplektas"],
        pricing: fixed(
          literal(),
          pick({ "Be padangų": "withoutTires", "Su padangomis": "withTires" }),
        ),
      },
      {
        value: "doors",
        types: ["Automobilio durys"],
        pricing: fixed(carSizes),
      },
      {
        value: "interior",
        types: ["Automobilio salonas"],
        pricing: callManager,
      },
      {
        value: "carQuarter",
        types: ["Automobilio ketvirtis"],
        pricing: callManager,
      },
      {
        value: "bumper",
        types: ["Automobilio buferis"],
        pricing: fixed(carSizes),
      },
      {
        value: "cover",
        types: ["Automobilio priekinis/galinis dangtis"],
        pricing: fixed(carSizes),
      },
      {
        value: "engine",
        types: ["Automobilio variklis"],
        pricing: fixed(literal(), pick({ Tuščias: "empty", Pilnas: "full" })),
      },
      {
        value: "gearbox",
        types: ["Pavarų dėžė"],
        pricing: fixed(
          literal(),
          pick({ Mechaninė: "manual", Automatinė: "automatic" }),
        ),
      },
    ],
  },
  {
    value: "householdAppliances",
    sheet: "Buitinė technika",
    subCategories: [
      {
        value: "fridge",
        types: ["Šaldytuvas"],
        pricing: perCubicMetre("Išmatavimai"),
      },
      {
        value: "freezer",
        types: ["Šaldiklis"],
        pricing: perCubicMetre("Išmatavimai"),
      },
      {
        value: "washingMachine",
        types: [
          "Maža skalbimo mašina",
          "Vidutinė skalbimo mašina",
          "Didelė skalbimo mašina",
          "Pramoninė skalbimo mašina",
        ],
        pricing: fixed(
          pick({
            "Talpa 3-5 kg": "smallWashingMachine",
            "Talpa 6-7 kg": "mediumWashingMachine",
            "Talpa 8-9 kg": "bigWashingMachine",
            "Talpa 10+ kg": "industrialWashingMachine",
          }),
        ),
      },
      {
        value: "dishwasher",
        types: ["Butinė indaplovė"],
        pricing: fixed(none),
      },
      {
        value: "industrialDishwasher",
        types: ["Pramoninė indaplovė"],
        pricing: fixed(none),
      },
      { value: "dryer", types: ["Buitinė džiovyklė"], pricing: fixed(none) },
      {
        value: "industrialDryer",
        types: ["Pramoninė džiovyklė"],
        pricing: fixed(none),
      },
      { value: "hob", types: ["Kaitlentė"], pricing: fixed(none) },
      {
        value: "stove",
        types: ["Viryklė"],
        pricing: fixed(
          pick({
            Įmontuojama: "built-in",
            Pastatoma: "freestanding",
            "5-6 degiklių": "withBurners",
          }),
        ),
      },
    ],
  },
  {
    value: "bicyclesAndScooters",
    sheet: "Dviračiai, paspirtukai",
    subCategories: [
      {
        value: "childBicycleAndTricycle",
        types: [
          "Vaikiškas dviratis, triratis",
          "Vaikiškas dviratis, triratis (<12 metų)",
        ],
        pricing: fixed(bikeSizes),
      },
      {
        value: "teenagersBike",
        types: ["Paauglio dviratis (>12 metų)"],
        pricing: fixed(bikeSizes),
      },
      {
        value: "adultBike",
        types: ["Suaugusiojo dviratis"],
        pricing: fixed(bikeSizes),
      },
      {
        value: "electricBike",
        types: ["Elektrinis dviratis"],
        pricing: fixed(bikeSizes),
      },
      {
        value: "childBicycleTrailer",
        types: ["Vaikiška dviračio priekaba"],
        pricing: fixed(
          pick({ Išardyta: "dismantled", Surinkta: "fullyAssembled" }),
        ),
      },
      {
        value: "electricScooter",
        types: ["Elektrinis paspirtukas"],
        pricing: fixed(literal()),
      },
    ],
  },
  {
    value: "motorcyclesAndAccessories",
    sheet: "Motociklai ir priedai",
    subCategories: [
      {
        value: "scooterMoped",
        types: ["Motoroleris, mopedas"],
        pricing: fixed(literal()),
      },
      {
        value: "standardMotorcycle",
        types: ["Standartinis motociklas"],
        pricing: fixed(literal()),
      },
      {
        value: "motocrossMotorcycle",
        types: ["Krosinis motociklas"],
        pricing: fixed(literal()),
      },
      {
        value: "touringMotorcycle",
        types: ["Kelioninis motociklas"],
        pricing: fixed(literal()),
      },
      {
        value: "sportsMotorcycle",
        types: ["Sportinis motociklas"],
        pricing: fixed(literal()),
      },
      {
        value: "chopper",
        types: ["Čioperis"],
        // The spreadsheet says "1200 cm3" where it means ">1200 cm3".
        pricing: fixed(
          literal((text) => (text === "1200 cm3" ? ">1200 cm3" : text)),
        ),
      },
      { value: "enduro", types: ["Enduro"], pricing: fixed(literal()) },
      { value: "quadBike", types: ["Keturratis"], pricing: fixed(literal()) },
      {
        value: "motorcycleEngine",
        types: ["Motociklo variklis"],
        pricing: fixed(literal()),
      },
      {
        value: "goodsForMotorcycles",
        types: ["Prekės motociklams"],
        pricing: fixed(
          pick({
            "Motociklo krepšys (dėžė)": "motorcycleBag",
            Duslintuvas: "muffler",
          }),
        ),
      },
    ],
  },
  {
    value: "palettes",
    sheet: "Paletės",
    subCategories: [],
    pricing: callManager,
  },
  {
    value: "removals",
    sheet: "Perkraustymai, baldai",
    subCategories: [],
    pricing: {
      type: "measured",
      byWeight: null,
      byVolume: [
        { size: "<1 m3", upTo: 1, perUnit: true },
        { size: "<2 m3", upTo: 2, perUnit: true },
        { size: "<3 m3", upTo: 3, perUnit: true },
        { size: "<4 m3", upTo: 4, perUnit: true },
        { size: "<5 m3", upTo: 5, perUnit: true },
        { size: "<10 m3", upTo: 10, perUnit: true },
        { size: ">10 m3", upTo: null, perUnit: true },
      ],
    },
  },
  {
    value: "flatScreenTv",
    sheet: "Plokščiaekraniai TV",
    subCategories: [],
    pricing: fixed(literal((text) => text.replace(/\s*coliai$/, " inch"))),
  },
  {
    value: "goodsForChildren",
    sheet: "Prekės vaikams",
    subCategories: [
      {
        value: "childSeat",
        types: ["Automobilinė kėdutė"],
        pricing: fixed(
          pick({
            "Be pado, nepasukama": "withoutSole",
            "Pasukama ir/arba su padu": "withSole",
          }),
        ),
      },
      {
        value: "strollers",
        types: ["Vežimėliai"],
        pricing: fixed(
          pick({
            "Skėtukas (kelioninis)": "umbrella",
            Sportinis: "sport",
            "Lopšio vežimėlis": "cradleStroller",
            Dvyniams: "forTwins",
            "2 in 1": "2in1",
            "3 in 1": "3in1",
          }),
        ),
      },
    ],
  },
  {
    value: "gardenEquipment",
    sheet: "Sodo technika",
    subCategories: [
      {
        value: "smallGardenTractor",
        types: ["Mažas sodo traktorius"],
        pricing: fixed(tractorSizes, tractorSpecs),
      },
      {
        value: "averageGardenTractor",
        types: ["Vidutinis sodo traktorius"],
        pricing: fixed(tractorSizes, tractorSpecs),
      },
      {
        value: "bigGardenTractor",
        types: ["Didelis sodo traktorius"],
        pricing: fixed(tractorSizes, tractorSpecs),
      },
      {
        value: "smallPushMower",
        types: ["Maža stumdoma žoliapjovė"],
        pricing: fixed(none),
      },
      {
        value: "bigPushMower",
        types: ["Didelė stumdoma žoliapjovė"],
        pricing: fixed(none),
      },
      {
        value: "smallSelfPropelledMower",
        types: ["Maža savaeigė žoliapjovė"],
        pricing: fixed(none),
      },
      {
        value: "bigSelfPropelledMower",
        types: ["Didelė savaeigė žoliapjovė"],
        pricing: fixed(none),
      },
    ],
  },
];

// Typos of the spreadsheet fixed in the catalog. Each must still be in the
// CSV (the script stops otherwise, so a fixed spreadsheet is noticed).
const VOLUME_FIXES = [
  {
    type: "Pavarų dėžė",
    size: "<2000 cm3",
    spec: "Mechaninė",
    from: 0.4,
    to: 0.04,
  },
  {
    type: "Pavarų dėžė",
    size: "<2500 cm3",
    spec: "Automatinė",
    from: 0.4,
    to: 0.04,
  },
];

const same = (a: string, b: string) =>
  normalizeSheetText(a) === normalizeSheetText(b);

function fail(row: SheetRow, message: string): never {
  throw new Error(
    `Row ${row.line} (${row.category} · ${row.type} · ${row.size} · ${row.spec}): ${message}`,
  );
}

function readNumber(row: SheetRow, cell: keyof SheetRow["cells"]) {
  const value = parseSheetNumber(row.cells[cell]);
  if (value === "invalid") {
    fail(row, `${cell} "${row.cells[cell]}" is not a number`);
  }
  return value;
}

function readMoney(row: SheetRow): Money {
  const gbp = readNumber(row, "gbp");
  const eur = readNumber(row, "eur");
  if (gbp === null || eur === null) {
    fail(row, "price is empty");
  }
  return { "UK-LT": gbp, "LT-UK": eur };
}

function buildPricing(rule: PricingRule): Pricing {
  if (rule.type === "fixed") {
    return { type: "fixed", variants: [] };
  }
  if (rule.type === "measured") {
    return {
      type: "measured",
      byWeight: rule.byWeight ? [] : null,
      byVolume: rule.byVolume ? [] : null,
    };
  }
  return { type: "callManager" };
}

function addRow(row: SheetRow, rule: PricingRule, pricing: Pricing) {
  const sheet = { type: row.type, size: row.size, spec: row.spec };

  if (rule.type === "fixed" && pricing.type === "fixed") {
    const size = rule.size(row.size);
    const specification = rule.spec(row.spec);
    if (size === undefined) {
      fail(row, "unknown size");
    }
    if (specification === undefined) {
      fail(row, "unknown specification");
    }

    let volume = readNumber(row, "volume");
    const fix = VOLUME_FIXES.find(
      (item) =>
        same(item.type, row.type) &&
        same(item.size, row.size) &&
        same(item.spec, row.spec),
    );
    if (fix) {
      if (volume !== fix.from) {
        fail(row, `expected volume ${fix.from} to fix, found ${volume}`);
      }
      volume = fix.to;
    }

    const variant: Variant = {
      sheet,
      size,
      specification,
      volume,
      weight: readNumber(row, "weight"),
      price: readMoney(row),
    };
    pricing.variants.push(variant);
    return;
  }

  if (rule.type === "measured" && pricing.type === "measured") {
    for (const basis of ["byWeight", "byVolume"] as const) {
      const tierRule = rule[basis]?.find((item) => same(item.size, row.size));
      if (tierRule) {
        const tier: Tier = {
          sheet,
          upTo: tierRule.upTo,
          price: readMoney(row),
          perUnit: tierRule.perUnit,
        };
        pricing[basis]?.push(tier);
        return;
      }
    }
    fail(row, "unknown tier");
  }

  fail(row, "row for a contact-manager item");
}

function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error(
      'Usage: npx tsx scripts/generate-price-catalog.ts "<CSV path>"',
    );
  }

  const parsed = parsePriceSheet(fs.readFileSync(file, "utf8"));
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  const categories: Category[] = MAPPING.map((rule, order) => ({
    value: rule.value,
    label: rule.value,
    sheet: rule.sheet,
    order,
    subCategories: rule.subCategories.map((sub): SubCategory => ({
      value: sub.value,
      label: sub.value,
      pricing: buildPricing(sub.pricing),
    })),
    pricing: rule.pricing ? buildPricing(rule.pricing) : null,
  }));

  for (const row of parsed.rows) {
    const index = MAPPING.findIndex((rule) => same(rule.sheet, row.category));
    if (index === -1) {
      fail(row, "unknown category");
    }
    const rule = MAPPING[index];
    const category = categories[index];

    if (rule.pricing && category.pricing && !row.type) {
      addRow(row, rule.pricing, category.pricing);
      continue;
    }

    const subIndex = rule.subCategories.findIndex((sub) =>
      sub.types.some((type) => same(type, row.type)),
    );
    if (subIndex === -1) {
      fail(row, "unknown type");
    }
    addRow(
      row,
      rule.subCategories[subIndex].pricing,
      category.subCategories[subIndex].pricing,
    );
  }

  const result = catalogSchema.safeParse(categories);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(result.data, null, 2)}\n`);
  const variants = categories.flatMap((category) => [
    category.pricing,
    ...category.subCategories.map((sub) => sub.pricing),
  ]);
  console.log(
    `Wrote ${OUTPUT}: ${categories.length} categories, ` +
      `${variants.filter((pricing) => pricing?.type === "fixed").flatMap((pricing) => (pricing?.type === "fixed" ? pricing.variants : [])).length} variants, ` +
      `${parsed.rows.length} spreadsheet rows.`,
  );
}

main();
```

- [ ] **Step 4: Generate the catalog**

Run: `npx tsx scripts/generate-price-catalog.ts lib/__fixtures__/pricelist-2026-09-17.csv`
Expected: `Wrote .../scripts/data/price-catalog.json: 10 categories, 157 variants, 175 spreadsheet rows.`

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/price-catalog.test.ts`
Expected: PASS (5 tests). The diff test proves the catalog equals the spreadsheet except the two gearbox volume fixes.

- [ ] **Step 6: Show the catalog to the user**

Send `scripts/data/price-catalog.json` to the user to review as a diff, as agreed in the spec. Continue after they say it is fine.

- [ ] **Step 7: Commit**

```bash
npm run format
git add scripts/generate-price-catalog.ts scripts/data/price-catalog.json lib/price-catalog.test.ts
git commit -m "feat(prices): initial catalog generated from the 2026-09-17 price list"
```

---

### Task 5: Model, public GET and seed script

**Files:**
- Create: `lib/models/price-category.ts`, `app/api/prices/route.ts`, `scripts/import-prices.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `Category`, `catalogSchema` (Task 1); `corsHeaders`, `preflight`, `withErrorHandling` (`lib/api.ts`); `connectDB` (`lib/db.ts`)
- Produces:
  - `PriceCategory: Model<Category>` (collection `pricecategories`, unique `value`, timestamps)
  - `GET /api/prices` → `{ categories: StoredCategory[] }` sorted by `order`, CORS for `CORS_ORIGINS`
  - `npm run import:prices` (dry run) and `npm run import:prices -- --write`

Route handlers are not unit-tested in this repo (only `lib/` is); they stay thin and are checked by the type check and in the browser.

- [ ] **Step 1: Read the Next 16 route handler guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Note: GET route handlers are not cached by default.

- [ ] **Step 2: Model**

Create `lib/models/price-category.ts`:

```ts
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
```

- [ ] **Step 3: GET route**

Create `app/api/prices/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, preflight, withErrorHandling } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";

// The whole catalog in one response: about 180 prices, no paging needed.
export const GET = withErrorHandling(async (request: NextRequest) => {
  const cors = corsHeaders(request);

  await connectDB();
  const categories = await PriceCategory.find()
    .sort({ order: 1, value: 1 })
    .lean();

  return NextResponse.json({ categories }, { headers: cors });
});

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}
```

- [ ] **Step 4: Seed script**

Create `scripts/import-prices.ts`:

```ts
/**
 * Fills the `pricecategories` collection from scripts/data/price-catalog.json.
 *
 *   npm run import:prices             dry run: report only, nothing is written
 *   npm run import:prices -- --write  insert categories that are not in the DB yet
 *
 * Insert-only, like import:postcodes: a re-run never overwrites CMS edits.
 * Rebuild the JSON with scripts/generate-price-catalog.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { catalogSchema } from "@/lib/validation/price";

loadEnvConfig(process.cwd());

const SOURCE = path.join(
  process.cwd(),
  "scripts",
  "data",
  "price-catalog.json",
);
const write = process.argv.includes("--write");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (.env.local)");
  }

  const parsed = catalogSchema.safeParse(
    JSON.parse(fs.readFileSync(SOURCE, "utf8")),
  );
  if (!parsed.success) {
    throw new Error(
      `price-catalog.json is invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }
  const catalog = parsed.data;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Target: host=${host} db=${name} collection=pricecategories`);

  const collection = mongoose.connection.collection("pricecategories");
  const existing = new Set(
    (await collection.find({}, { projection: { value: 1 } }).toArray()).map(
      (doc) => doc.value as string,
    ),
  );
  const toInsert = catalog.filter((category) => !existing.has(category.value));

  console.log(`Categories in file:       ${catalog.length}`);
  console.log(`Already in DB (skipped):  ${catalog.length - toInsert.length}`);
  console.log(`To insert:                ${toInsert.length}`);
  for (const category of toInsert) {
    console.log(`  - ${category.value}`);
  }

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to insert.");
    return;
  }

  await collection.createIndex({ value: 1 }, { unique: true });
  if (toInsert.length > 0) {
    const now = new Date();
    await collection.insertMany(
      toInsert.map((category) => ({
        ...category,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  console.log(`\nDone. Inserted ${toInsert.length}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
```

In `package.json`, add the script after `import:postcodes`:

```json
    "import:postcodes": "tsx scripts/import-postcodes.ts",
    "import:prices": "tsx scripts/import-prices.ts",
```

- [ ] **Step 5: Type check and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Dry run against the database (read-only)**

Run: `npm run import:prices`
Expected: `Target: host=... db=ecotrip collection=pricecategories`, `Categories in file: 10`, `To insert: 10`, then `Dry run. Nothing written.`

- [ ] **Step 7: Insert, only after the user's OK**

Ask the user in chat: insert 10 price categories into the database from `.env.local` (name the host and db printed in Step 6)? On yes, run `npm run import:prices -- --write`.
Expected: `Done. Inserted 10.` A second dry run shows `To insert: 0`.

- [ ] **Step 8: Check the API**

Run: `npm run dev`, then in another terminal `curl -s http://localhost:3000/api/prices | head -c 300`
Expected: JSON that starts with `{"categories":[{"_id":"...","value":"shipments"`.

- [ ] **Step 9: Commit**

```bash
npm run format
git add lib/models/price-category.ts app/api/prices/route.ts scripts/import-prices.ts package.json
git commit -m "feat(prices): price category model, public GET and seed script"
```

---

### Task 6: Table drafts

**Files:**
- Create: `lib/price-drafts.ts`
- Test: `lib/price-drafts.test.ts`

**Interfaces:**
- Consumes: `normalizeSheetText`, `readTargetField`, `sheetTargets`, `writeTargetField`, `SheetTarget` (Task 1); `categorySchema` (Task 1)
- Produces:
  - `type DraftField = ChangeField | "upTo"`, `VARIANT_FIELDS`, `TIER_FIELDS`
  - `type CategoryDrafts = Record<string, string>` (cell key → typed text)
  - `cellKey(sheet: SheetKey, field: DraftField): string`
  - `fieldsOf(target: SheetTarget): DraftField[]`
  - `readCell(target: SheetTarget, field: DraftField): number | null | undefined`
  - `cellText(value: number | null | undefined): string`
  - `parseCellNumber(text: string): number | null | "invalid"`
  - `setDraft(drafts, key, text, saved: number | null): CategoryDrafts`
  - `applyDrafts(category: Category, drafts: CategoryDrafts): { category: Category; cellErrors: Record<string, string>; formErrors: string[] }`
  - `pruneDrafts(category: Category, drafts: CategoryDrafts): CategoryDrafts`

- [ ] **Step 1: Write the failing test**

Create `lib/price-drafts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyDrafts,
  cellKey,
  cellText,
  parseCellNumber,
  pruneDrafts,
  setDraft,
} from "@/lib/price-drafts";
import { sampleCatalog } from "@/lib/price-test-data";
import type { FixedPricing, MeasuredPricing } from "@/lib/price-types";

const wheels = { type: "Ratų komplektas", size: "<R16", spec: "Be padangų" };
const firstTier = { type: "", size: "<15 kg", spec: "" };

describe("parseCellNumber", () => {
  it.each([
    ["66", 66],
    ["1,65", 1.65],
    [" 0.04 ", 0.04],
    ["", null],
    ["12a", "invalid"],
    ["-3", "invalid"],
  ])("reads %j as %j", (text, expected) => {
    expect(parseCellNumber(text)).toBe(expected);
  });

  it("writes null as an empty cell", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(0.08)).toBe("0.08");
  });
});

describe("setDraft", () => {
  it("keeps typed text and drops it when it equals the saved value", () => {
    const key = cellKey(wheels, "price.UK-LT");
    const typed = setDraft({}, key, "70", 66);
    expect(typed).toEqual({ [key]: "70" });
    expect(setDraft(typed, key, "66,0", 66)).toEqual({});
  });
});

describe("applyDrafts", () => {
  it("applies prices typed with a comma", () => {
    const [, automotive] = sampleCatalog();
    const applied = applyDrafts(automotive, {
      [cellKey(wheels, "price.LT-UK")]: "70,5",
    });
    expect(applied.cellErrors).toEqual({});
    expect(applied.formErrors).toEqual([]);
    expect(
      (applied.category.subCategories[0].pricing as FixedPricing).variants[0]
        .price,
    ).toEqual({
      "UK-LT": 66,
      "LT-UK": 70.5,
    });
    // The saved category is not touched.
    expect(
      (automotive.subCategories[0].pricing as FixedPricing).variants[0].price[
        "LT-UK"
      ],
    ).toBe(66);
  });

  it("clears volume and weight with an empty cell", () => {
    const [, automotive] = sampleCatalog();
    const applied = applyDrafts(automotive, {
      [cellKey(wheels, "volume")]: "",
    });
    expect(
      (applied.category.subCategories[0].pricing as FixedPricing).variants[0]
        .volume,
    ).toBeNull();
    expect(applied.formErrors).toEqual([]);
  });

  it("marks bad cells", () => {
    const [, automotive] = sampleCatalog();
    const price = cellKey(wheels, "price.UK-LT");
    const weight = cellKey(wheels, "weight");
    expect(
      applyDrafts(automotive, { [price]: "", [weight]: "x" }).cellErrors,
    ).toEqual({
      [price]: "Must be greater than 0",
      [weight]: "Not a number",
    });
  });

  it("edits tier limits and reports tiers that stop going up", () => {
    const [shipments] = sampleCatalog();
    const applied = applyDrafts(shipments, {
      [cellKey(firstTier, "upTo")]: "20",
    });
    expect(
      (applied.category.pricing as MeasuredPricing).byWeight?.[0].upTo,
    ).toBe(20);
    expect(applied.formErrors).toEqual([]);

    const open = applyDrafts(shipments, { [cellKey(firstTier, "upTo")]: "" });
    expect(open.formErrors).toEqual([
      "Only the last tier can have no upper limit",
    ]);
  });
});

describe("pruneDrafts", () => {
  it("keeps only drafts that differ from the saved category", () => {
    const [, automotive] = sampleCatalog();
    const same = cellKey(wheels, "price.UK-LT");
    const different = cellKey(wheels, "weight");
    const gone = cellKey(
      { type: "Ratų komplektas", size: "<R18", spec: "" },
      "weight",
    );
    expect(
      pruneDrafts(automotive, { [same]: "66", [different]: "30", [gone]: "1" }),
    ).toEqual({
      [different]: "30",
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/price-drafts.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/price-drafts"".

- [ ] **Step 3: Implement**

Create `lib/price-drafts.ts`:

```ts
import {
  normalizeSheetText,
  readTargetField,
  sheetTargets,
  writeTargetField,
  type SheetTarget,
} from "@/lib/price-sheet-key";
import type { Category, ChangeField, SheetKey } from "@/lib/price-types";
import { categorySchema } from "@/lib/validation/price";

// Cells editable in the CMS table: variants have prices, volume and weight;
// tiers have prices and the upper limit.
export type DraftField = ChangeField | "upTo";

export const VARIANT_FIELDS: DraftField[] = [
  "volume",
  "weight",
  "price.UK-LT",
  "price.LT-UK",
];
export const TIER_FIELDS: DraftField[] = ["upTo", "price.UK-LT", "price.LT-UK"];

// Unsaved cell texts of one category, by cellKey.
export type CategoryDrafts = Record<string, string>;

export function cellKey(sheet: SheetKey, field: DraftField) {
  return `${[sheet.type, sheet.size, sheet.spec].map(normalizeSheetText).join("|")}#${field}`;
}

export function fieldsOf(target: SheetTarget) {
  return target.kind === "variant" ? VARIANT_FIELDS : TIER_FIELDS;
}

export function readCell(target: SheetTarget, field: DraftField) {
  if (field === "upTo") {
    return target.kind === "tier" ? target.item.upTo : undefined;
  }
  return readTargetField(target, field);
}

export function cellText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

// "1,65" and "1.65" both read as 1.65; an empty cell is null.
export function parseCellNumber(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return /^\d+(?:[.,]\d+)?$/.test(trimmed)
    ? Number(trimmed.replace(",", "."))
    : "invalid";
}

// Stores what was typed, or drops the draft when it equals the saved value.
export function setDraft(
  drafts: CategoryDrafts,
  key: string,
  text: string,
  saved: number | null,
) {
  const next = { ...drafts };
  if (parseCellNumber(text) === saved) {
    delete next[key];
  } else {
    next[key] = text;
  }
  return next;
}

export type AppliedDrafts = {
  category: Category;
  cellErrors: Record<string, string>;
  formErrors: string[];
};

function writeCell(
  target: SheetTarget,
  field: DraftField,
  value: number | null,
) {
  if (field === "upTo") {
    if (target.kind === "tier") {
      target.item.upTo = value;
    }
    return;
  }
  writeTargetField(target, field, value);
}

/** The category with the drafts applied, checked like the API checks it. */
export function applyDrafts(
  category: Category,
  drafts: CategoryDrafts,
): AppliedDrafts {
  const copy = structuredClone(category);
  const cellErrors: Record<string, string> = {};

  for (const target of sheetTargets(copy)) {
    for (const field of fieldsOf(target)) {
      const key = cellKey(target.item.sheet, field);
      if (!(key in drafts)) {
        continue;
      }
      const value = parseCellNumber(drafts[key]);
      if (value === "invalid") {
        cellErrors[key] = "Not a number";
      } else if (field.startsWith("price.") && (value === null || value <= 0)) {
        cellErrors[key] = "Must be greater than 0";
      } else if (field === "upTo" && value === 0) {
        cellErrors[key] = "Must be greater than 0";
      } else {
        writeCell(target, field, value);
      }
    }
  }

  if (Object.keys(cellErrors).length > 0) {
    return { category: copy, cellErrors, formErrors: [] };
  }

  const result = categorySchema.safeParse(copy);
  return {
    category: copy,
    cellErrors,
    formErrors: result.success
      ? []
      : result.error.issues.map((issue) => issue.message),
  };
}

// Drops drafts that equal the saved category (after a save, or after a reload).
export function pruneDrafts(category: Category, drafts: CategoryDrafts) {
  const next: CategoryDrafts = {};
  for (const target of sheetTargets(category)) {
    for (const field of fieldsOf(target)) {
      const key = cellKey(target.item.sheet, field);
      if (
        key in drafts &&
        parseCellNumber(drafts[key]) !== readCell(target, field)
      ) {
        next[key] = drafts[key];
      }
    }
  }
  return next;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/price-drafts.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add lib/price-drafts.ts lib/price-drafts.test.ts
git commit -m "feat(prices): drafts for the prices table"
```

---

### Task 7: PUT route and the `/prices` page

**Files:**
- Create: `app/api/prices/[category]/route.ts`, `lib/prices-client.ts`, `components/prices-table.tsx`, `app/(cms)/prices/page.tsx`
- Modify: `components/sidebar.tsx:10`

**Interfaces:**
- Consumes: `putCategoryBodySchema` (Task 1); `PriceCategory` (Task 5); drafts API (Task 6); `errorMessage` (`lib/postcodes-client.ts`); `PriceImportResult` from `lib/price-import.ts` is added in Task 8, so `lib/prices-client.ts` gets its import function in Task 8.
- Produces:
  - `PUT /api/prices/:category` with body `{ category: Category, updatedAt: string }` → saved `StoredCategory`; 400 if `category.value` differs from the path, 404 for an unknown category, 409 if `updatedAt` is stale
  - `fetchPriceCatalog(signal?: AbortSignal): Promise<StoredCategory[]>`
  - `type WriteResult<T> = { ok: true; body: T } | { ok: false; status: number; message: string }`
  - `saveCategory(saved: StoredCategory, next: Category, refreshToken: () => Promise<unknown>): Promise<WriteResult<StoredCategory>>`
  - `PricesTable` component

- [ ] **Step 1: PUT route**

Create `app/api/prices/[category]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import {
  errorJson,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";
import { putCategoryBodySchema } from "@/lib/validation/price";

type Context = { params: Promise<{ category: string }> };

/**
 * Replaces one category. `updatedAt` is the version the client read: if the
 * category changed since then (another tab, an import), the answer is 409 and
 * nothing is written.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: Context) => {
    const unauthorized = await requireAdmin();
    if (unauthorized) {
      return unauthorized;
    }

    const unsupported = requireJson(request);
    if (unsupported) {
      return unsupported;
    }

    const { category: value } = await params;
    const parsed = putCategoryBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { category, updatedAt } = parsed.data;
    if (category.value !== value) {
      return errorJson(400, "Category value cannot change");
    }

    await connectDB();

    const saved = await PriceCategory.findOneAndUpdate(
      { value, updatedAt: new Date(updatedAt) },
      {
        $set: {
          label: category.label,
          sheet: category.sheet,
          order: category.order,
          subCategories: category.subCategories,
          pricing: category.pricing,
        },
      },
      { returnDocument: "after" },
    ).lean();

    if (saved) {
      return NextResponse.json(saved);
    }

    return (await PriceCategory.exists({ value }))
      ? errorJson(409, "Prices changed since you opened the page. Reload it.")
      : errorJson(404, "Category not found");
  },
);
```

- [ ] **Step 2: Browser client (without import for now)**

Create `lib/prices-client.ts` with the content below, leaving out three things that Task 8 adds: the `importPriceChanges` function, the `PriceImportResult` import, and `PriceChange` in the type import (lint fails on unused imports):

```ts
import { errorMessage } from "@/lib/postcodes-client";
import type { PriceImportResult } from "@/lib/price-import";
import type {
  Category,
  PriceCatalog,
  PriceChange,
  StoredCategory,
} from "@/lib/price-types";

// Browser helpers for the price API.

export async function fetchPriceCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/prices", { signal, cache: "no-store" });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new Error(
      errorMessage(body, `Failed to load prices (HTTP ${response.status})`),
    );
  }

  return (body as PriceCatalog).categories;
}

export type WriteResult<T> =
  { ok: true; body: T } | { ok: false; status: number; message: string };

async function write<T>(
  url: string,
  method: "PUT" | "POST",
  payload: unknown,
  refreshToken: () => Promise<unknown>,
): Promise<WriteResult<T>> {
  const send = () =>
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  let response = await send();
  if (response.status === 401) {
    // The short-lived session token can expire in a background tab: refresh
    // it once and retry before giving up.
    await refreshToken();
    response = await send();
  }
  const body = await response.json().catch(() => null);

  if (response.ok && body) {
    return { ok: true, body: body as T };
  }

  const message =
    response.status === 401
      ? "Session expired. Sign in again in a new tab (/login), then try again. Your changes are kept."
      : response.status === 403
        ? "You do not have permission to edit."
        : errorMessage(body, `Request failed (HTTP ${response.status})`);
  return { ok: false, status: response.status, message };
}

export function saveCategory(
  saved: StoredCategory,
  next: Category,
  refreshToken: () => Promise<unknown>,
) {
  return write<StoredCategory>(
    `/api/prices/${encodeURIComponent(saved.value)}`,
    "PUT",
    { category: next, updatedAt: saved.updatedAt },
    refreshToken,
  );
}

export function importPriceChanges(
  changes: PriceChange[],
  refreshToken: () => Promise<unknown>,
) {
  return write<PriceImportResult>(
    "/api/prices/import",
    "POST",
    { changes },
    refreshToken,
  );
}
```

- [ ] **Step 3: Table component**

Create `components/prices-table.tsx`:

```tsx
"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyDrafts,
  cellKey,
  cellText,
  pruneDrafts,
  readCell,
  setDraft,
  type CategoryDrafts,
  type DraftField,
} from "@/lib/price-drafts";
import type { SheetTarget } from "@/lib/price-sheet-key";
import type { Category, StoredCategory } from "@/lib/price-types";
import { fetchPriceCatalog, saveCategory } from "@/lib/prices-client";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { label: "Type", width: 220 },
  { label: "Size", width: 200 },
  { label: "Specification", width: 160 },
  { label: "Volume (m³)", width: 120 },
  { label: "Weight (kg)", width: 120 },
  { label: "UK→LT (£)", width: 140 },
  { label: "LT→UK (€)", width: 140 },
];
const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);

// One table row: a variant, a tier (its limit sits in the Weight or Volume
// column of its basis) or a contact-manager item without prices.
type PriceRowModel =
  | { kind: "variant"; key: string; target: SheetTarget }
  | {
      kind: "tier";
      key: string;
      target: SheetTarget;
      basis: "weight" | "volume";
    }
  | { kind: "callManager"; key: string; label: string };

function tableRows(category: Category): PriceRowModel[] {
  const parts = category.pricing
    ? [{ label: category.label, pricing: category.pricing }]
    : category.subCategories.map((sub) => ({
        label: sub.label,
        pricing: sub.pricing,
      }));

  return parts.flatMap(({ label, pricing }): PriceRowModel[] => {
    if (pricing.type === "callManager") {
      return [{ kind: "callManager", key: `call:${label}`, label }];
    }
    if (pricing.type === "fixed") {
      return pricing.variants.map((item) => ({
        kind: "variant",
        key: cellKey(item.sheet, "price.UK-LT"),
        target: { kind: "variant", category: category.value, item },
      }));
    }
    return (["byWeight", "byVolume"] as const).flatMap((basis) =>
      (pricing[basis] ?? []).map((item): PriceRowModel => ({
        kind: "tier",
        key: cellKey(item.sheet, "price.UK-LT"),
        target: { kind: "tier", category: category.value, item },
        basis: basis === "byWeight" ? "weight" : "volume",
      })),
    );
  });
}

type CellProps = {
  target: SheetTarget;
  field: DraftField;
  drafts: CategoryDrafts;
  errors: Record<string, string>;
  suffix?: string;
  placeholder?: string;
  onChange: (key: string, text: string, saved: number | null) => void;
};

function NumberCell({
  target,
  field,
  drafts,
  errors,
  suffix,
  placeholder,
  onChange,
}: CellProps) {
  const key = cellKey(target.item.sheet, field);
  const saved = readCell(target, field) ?? null;
  const draft = drafts[key];
  const error = errors[key];

  return (
    <div className="flex items-center gap-1">
      <Input
        inputMode="decimal"
        value={draft ?? cellText(saved)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        title={error}
        className={cn(draft !== undefined && "bg-brand/10")}
        onChange={(event) => onChange(key, event.target.value, saved)}
      />
      {suffix && (
        <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

type BlockProps = {
  category: StoredCategory;
  drafts: CategoryDrafts;
  saving: boolean;
  error: string | undefined;
  onChange: (
    category: string,
    key: string,
    text: string,
    saved: number | null,
  ) => void;
  onSave: (category: StoredCategory, next: Category) => void;
};

const CategoryBlock = memo(function CategoryBlock({
  category,
  drafts,
  saving,
  error,
  onChange,
  onSave,
}: BlockProps) {
  const rows = useMemo(() => tableRows(category), [category]);
  const applied = useMemo(
    () => applyDrafts(category, drafts),
    [category, drafts],
  );
  const unsaved = Object.keys(drafts).length;
  const invalid =
    Object.keys(applied.cellErrors).length > 0 || applied.formErrors.length > 0;
  const change = useCallback(
    (key: string, text: string, saved: number | null) =>
      onChange(category.value, key, text, saved),
    [category.value, onChange],
  );
  const cell = (
    target: SheetTarget,
    field: DraftField,
    extra: Partial<CellProps> = {},
  ) => (
    <NumberCell
      target={target}
      field={field}
      drafts={drafts}
      errors={applied.cellErrors}
      onChange={change}
      {...extra}
    />
  );

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold">{category.sheet}</h2>
        {unsaved > 0 && (
          <span className="text-sm text-muted-foreground">
            Unsaved: {unsaved}
          </span>
        )}
        <Button
          disabled={unsaved === 0 || saving || invalid}
          onClick={() => onSave(category, applied.category)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {applied.formErrors.length > 0 && (
        <ul className="space-y-0.5 text-sm text-destructive">
          {applied.formErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <Table className="table-fixed" style={{ minWidth: TABLE_MIN_WIDTH }}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.label} style={{ width: column.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column.label}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.kind === "callManager") {
              return (
                <TableRow key={row.key} className="text-muted-foreground">
                  <TableCell>{row.label}</TableCell>
                  <TableCell colSpan={COLUMNS.length - 1}>
                    Contact manager
                  </TableCell>
                </TableRow>
              );
            }

            const { sheet } = row.target.item;
            const perUnit =
              row.kind === "tier" &&
              row.target.kind === "tier" &&
              row.target.item.perUnit
                ? row.basis === "weight"
                  ? "/kg"
                  : "/m³"
                : undefined;

            return (
              <TableRow key={row.key}>
                <TableCell className="whitespace-normal">
                  {sheet.type}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {sheet.size}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {sheet.spec}
                </TableCell>
                {row.kind === "variant" ? (
                  <>
                    <TableCell>{cell(row.target, "volume")}</TableCell>
                    <TableCell>{cell(row.target, "weight")}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      {row.basis === "volume" &&
                        cell(row.target, "upTo", {
                          placeholder: "no limit",
                          suffix: "max",
                        })}
                    </TableCell>
                    <TableCell>
                      {row.basis === "weight" &&
                        cell(row.target, "upTo", {
                          placeholder: "no limit",
                          suffix: "max",
                        })}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  {cell(row.target, "price.UK-LT", { suffix: perUnit })}
                </TableCell>
                <TableCell>
                  {cell(row.target, "price.LT-UK", { suffix: perUnit })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
});

function without<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function PricesTable() {
  const { getToken } = useAuth();
  const [categories, setCategories] = useState<StoredCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDrafts>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchPriceCatalog(controller.signal)
      .then(setCategories)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load prices",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const unsavedCount = Object.values(drafts).reduce(
    (sum, category) => sum + Object.keys(category).length,
    0,
  );

  useEffect(() => {
    if (unsavedCount === 0) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  const change = useCallback(
    (category: string, key: string, text: string, saved: number | null) => {
      setDrafts((current) => {
        const next = setDraft(current[category] ?? {}, key, text, saved);
        return Object.keys(next).length > 0
          ? { ...current, [category]: next }
          : without(current, category);
      });
    },
    [],
  );

  const save = useCallback(
    async (category: StoredCategory, next: Category) => {
      const value = category.value;
      setSaving((current) => ({ ...current, [value]: true }));
      setSaveErrors((current) => without(current, value));

      try {
        const result = await saveCategory(category, next, () =>
          getToken({ skipCache: true }),
        );
        if (!result.ok) {
          setSaveErrors((current) => ({ ...current, [value]: result.message }));
          return;
        }

        const saved = result.body;
        setCategories(
          (current) =>
            current?.map((item) => (item.value === value ? saved : item)) ??
            current,
        );
        // Keep whatever was typed after Save was clicked.
        setDrafts((current) => {
          const rest = pruneDrafts(saved, current[value] ?? {});
          return Object.keys(rest).length > 0
            ? { ...current, [value]: rest }
            : without(current, value);
        });
      } catch {
        setSaveErrors((current) => ({ ...current, [value]: "Network error" }));
      } finally {
        setSaving((current) => ({ ...current, [value]: false }));
      }
    },
    [getToken],
  );

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (!categories) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No prices yet. Fill them with npm run import:prices -- --write.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {unsavedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          Unsaved changes: {unsavedCount}. Save each category you changed.
        </p>
      )}
      {categories.map((category) => (
        <CategoryBlock
          key={category.value}
          category={category}
          drafts={drafts[category.value] ?? EMPTY_DRAFTS}
          saving={saving[category.value] ?? false}
          error={saveErrors[category.value]}
          onChange={change}
          onSave={save}
        />
      ))}
    </div>
  );
}

const EMPTY_DRAFTS: CategoryDrafts = {};
```

- [ ] **Step 4: Page and sidebar link**

Create `app/(cms)/prices/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PricesTable } from "@/components/prices-table";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Prices | Ecotrip CMS",
};

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  await requireAdminPage();
  const { imported } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Prices</h1>
        <Link
          href="/prices/import"
          className={buttonVariants({ variant: "outline" })}
        >
          Import CSV
        </Link>
      </div>
      {imported && (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
          Import applied: {imported} changes.
        </p>
      )}
      <PricesTable />
    </div>
  );
}
```

In `components/sidebar.tsx` replace

```tsx
const links = [{ href: "/postcodes", label: "Postcodes" }];
```

with

```tsx
const links = [
  { href: "/postcodes", label: "Postcodes" },
  { href: "/prices", label: "Prices" },
];
```

The page links to `/prices/import`, which Task 9 adds; until then the link shows Next's 404.

- [ ] **Step 5: Type check, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 6: Check in the browser (saves write to the DB: ask the user first)**

Run `npm run dev`, sign in as admin, open `http://localhost:3000/prices`.
Expected:
- 10 blocks in spreadsheet order, headed by the Lithuanian category names; `interior`, `carQuarter` and palettes rows grey with "Contact manager".
- Typing `abc` in a price marks the cell and disables Save; typing `70,5` highlights the cell and shows "Unsaved: 1".
- With the user's OK: Save on that block, reload: the value stays. Then type the old value back and Save again, so the DB ends as it started.
- Open the page in two tabs, save a change in one, then save in the other: the second shows "Prices changed since you opened the page. Reload it." and keeps its drafts.

- [ ] **Step 7: Commit**

```bash
npm run format
git add "app/api/prices/[category]/route.ts" lib/prices-client.ts components/prices-table.tsx "app/(cms)/prices/page.tsx" components/sidebar.tsx
git commit -m "feat(prices): prices page with per-category save"
```

---

### Task 8: Apply import changes and the import route

**Files:**
- Create: `lib/price-import.ts`, `app/api/prices/import/route.ts`
- Modify: `lib/prices-client.ts` (add `importPriceChanges`)
- Test: `lib/price-import.test.ts`

**Interfaces:**
- Consumes: `indexSheetTargets`, `readTargetField`, `sheetKeyId`, `writeTargetField` (Task 1); `importBodySchema`, `categorySchema` (Task 1); `PriceCategory` (Task 5)
- Produces:
  - `type PriceImportResult = { updated: number }`
  - `type ImportConflict = { change: PriceChange; reason: "not-found" | "stale" | "invalid-field" }`
  - `applyImportChanges(categories: Category[], changes: PriceChange[]): { updated: Category[]; conflicts: ImportConflict[] }` — works on copies; any conflict means `updated: []`
  - `POST /api/prices/import` with body `{ changes: PriceChange[] }` → `{ updated }`; 409 with `details.conflicts`; 400 if the result breaks the schema
  - `importPriceChanges(changes: PriceChange[], refreshToken): Promise<WriteResult<PriceImportResult>>`

- [ ] **Step 1: Write the failing test**

Create `lib/price-import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyImportChanges } from "@/lib/price-import";
import { sampleCatalog } from "@/lib/price-test-data";
import type { FixedPricing, PriceChange } from "@/lib/price-types";

const wheelsWithTires = {
  type: "Ratų komplektas",
  size: "<R16",
  spec: "Su padangomis",
};

function change(patch: Partial<PriceChange> = {}): PriceChange {
  return {
    category: "automotiveGoods",
    sheet: wheelsWithTires,
    field: "price.UK-LT",
    from: 77,
    to: 80,
    ...patch,
  };
}

describe("applyImportChanges", () => {
  it("changes a copy and returns only the changed categories", () => {
    const catalog = sampleCatalog();
    const outcome = applyImportChanges(catalog, [change()]);

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.updated.map((category) => category.value)).toEqual([
      "automotiveGoods",
    ]);
    const pricing = outcome.updated[0].subCategories[0].pricing as FixedPricing;
    expect(pricing.variants[1].price).toEqual({ "UK-LT": 80, "LT-UK": 77 });
    // The input is not touched.
    const original = catalog[1].subCategories[0].pricing as FixedPricing;
    expect(original.variants[1].price["UK-LT"]).toBe(77);
  });

  it("matches rows regardless of case and extra spaces", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({
        sheet: {
          type: " ratų  komplektas",
          size: "<r16",
          spec: "SU PADANGOMIS ",
        },
      }),
    ]);
    expect(outcome.conflicts).toEqual([]);
  });

  it("changes tier prices and variant volume", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({
        category: "shipments",
        sheet: { type: "", size: ">15 kg", spec: "" },
        field: "price.LT-UK",
        from: 1.65,
        to: 1.75,
      }),
      change({ field: "volume", from: 0.24, to: 0.25 }),
    ]);
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.updated).toHaveLength(2);
  });

  it("applies nothing when one value changed since the preview", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({ field: "volume", from: 0.24, to: 0.25 }),
      change({ from: 70 }),
    ]);
    expect(outcome.updated).toEqual([]);
    expect(outcome.conflicts).toEqual([
      { change: change({ from: 70 }), reason: "stale" },
    ]);
  });

  it("reports unknown rows and fields a tier does not have", () => {
    const outcome = applyImportChanges(sampleCatalog(), [
      change({ sheet: { type: "Ratų komplektas", size: "<R18", spec: "" } }),
      change({ category: "removals" }),
      change({
        category: "shipments",
        sheet: { type: "", size: "<15 kg", spec: "" },
        field: "weight",
        from: null,
      }),
      change({ to: null }),
    ]);
    expect(outcome.conflicts.map((conflict) => conflict.reason)).toEqual([
      "not-found",
      "not-found",
      "invalid-field",
      "invalid-field",
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/price-import.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/price-import"".

- [ ] **Step 3: Implement**

Create `lib/price-import.ts`:

```ts
import {
  indexSheetTargets,
  readTargetField,
  sheetKeyId,
  writeTargetField,
} from "@/lib/price-sheet-key";
import type { Category, PriceChange } from "@/lib/price-types";

export type ImportConflict = {
  change: PriceChange;
  reason: "not-found" | "stale" | "invalid-field";
};

// Response of POST /api/prices/import: how many changes were applied.
export type PriceImportResult = { updated: number };

export type ImportOutcome = {
  // Changed copies of the categories (empty when there are conflicts).
  updated: Category[];
  conflicts: ImportConflict[];
};

/**
 * Applies import changes to copies of the categories. Each change must still
 * find the value the preview showed (`from`); if any change does not, nothing
 * is applied, so an import never mixes with edits made after the preview.
 */
export function applyImportChanges(
  categories: Category[],
  changes: PriceChange[],
): ImportOutcome {
  const copies = structuredClone(categories);
  const byValue = new Map(copies.map((category) => [category.value, category]));
  const index = indexSheetTargets(copies);
  const conflicts: ImportConflict[] = [];
  const touched = new Set<string>();

  for (const change of changes) {
    const category = byValue.get(change.category);
    const target = category
      ? index.get(sheetKeyId(category.sheet, change.sheet))
      : undefined;
    if (!category || !target) {
      conflicts.push({ change, reason: "not-found" });
      continue;
    }

    const current = readTargetField(target, change.field);
    if (current === undefined) {
      conflicts.push({ change, reason: "invalid-field" });
      continue;
    }
    if (current !== change.from) {
      conflicts.push({ change, reason: "stale" });
      continue;
    }
    if (!writeTargetField(target, change.field, change.to)) {
      conflicts.push({ change, reason: "invalid-field" });
      continue;
    }
    touched.add(category.value);
  }

  return conflicts.length > 0
    ? { updated: [], conflicts }
    : {
        updated: copies.filter((category) => touched.has(category.value)),
        conflicts,
      };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/price-import.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Import route**

Create `app/api/prices/import/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import {
  errorJson,
  readJson,
  requireAdmin,
  requireJson,
  validationError,
  withErrorHandling,
} from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PriceCategory } from "@/lib/models/price-category";
import {
  applyImportChanges,
  type ImportConflict,
  type PriceImportResult,
} from "@/lib/price-import";
import type { Category } from "@/lib/price-types";
import { categorySchema, importBodySchema } from "@/lib/validation/price";

function toCategory(doc: Category): Category {
  const { value, label, sheet, order, subCategories, pricing } = doc;
  return { value, label, sheet, order, subCategories, pricing };
}

/**
 * Applies the changes picked in the import preview. All of them or none: if
 * any value changed since the preview, the answer is 409 with the conflicts.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const unauthorized = await requireAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const unsupported = requireJson(request);
  if (unsupported) {
    return unsupported;
  }

  const parsed = importBodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const { changes } = parsed.data;

  const mongoose = await connectDB();
  const session = await mongoose.startSession();
  let conflicts: ImportConflict[] = [];
  let invalid: string[] = [];

  try {
    await session.withTransaction(async () => {
      const docs = await PriceCategory.find({
        value: { $in: [...new Set(changes.map((change) => change.category))] },
      })
        .session(session)
        .lean();

      const outcome = applyImportChanges(docs.map(toCategory), changes);
      conflicts = outcome.conflicts;
      invalid = outcome.updated.flatMap((category) => {
        const result = categorySchema.safeParse(category);
        return result.success
          ? []
          : result.error.issues.map(
              (issue) => `${category.value}: ${issue.message}`,
            );
      });
      if (conflicts.length > 0 || invalid.length > 0) {
        return;
      }

      for (const category of outcome.updated) {
        await PriceCategory.updateOne(
          { value: category.value },
          {
            $set: {
              subCategories: category.subCategories,
              pricing: category.pricing,
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }

  if (conflicts.length > 0) {
    return errorJson(
      409,
      "Prices changed since the preview. Choose the file again.",
      {
        details: { conflicts },
      },
    );
  }
  if (invalid.length > 0) {
    return errorJson(400, "Import makes prices invalid", {
      details: { messages: invalid },
    });
  }

  const result: PriceImportResult = { updated: changes.length };
  return NextResponse.json(result);
});
```

The transaction needs a replica set, which Atlas has (the postcodes import already uses one).

- [ ] **Step 6: Client function**

In `lib/prices-client.ts` add `PriceChange,` to the `@/lib/price-types` type import, and add this import after the `errorMessage` import:

```ts
import type { PriceImportResult } from "@/lib/price-import";
```

and append the function at the end of the file:

```ts
export function importPriceChanges(
  changes: PriceChange[],
  refreshToken: () => Promise<unknown>,
) {
  return write<PriceImportResult>(
    "/api/prices/import",
    "POST",
    { changes },
    refreshToken,
  );
}
```

The file now matches the full listing in Task 7 Step 2.

- [ ] **Step 7: Type check, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
npm run format
git add lib/price-import.ts lib/price-import.test.ts app/api/prices/import/route.ts lib/prices-client.ts
git commit -m "feat(prices): apply import changes in one transaction"
```

---

### Task 9: Import page

**Files:**
- Create: `components/import-prices.tsx`, `app/(cms)/prices/import/page.tsx`

**Interfaces:**
- Consumes: `parsePriceSheet`, `SHEET_MAX_BYTES` (Task 2); `diffPriceSheet`, `FIELD_LABELS`, `SheetDiff` (Task 3); `fetchPriceCatalog`, `importPriceChanges` (Tasks 7, 8)
- Produces: `ImportPrices` component; page `/prices/import`; on success it navigates to `/prices?imported=N`, which `app/(cms)/prices/page.tsx` (Task 7) shows as "Import applied: N changes."

- [ ] **Step 1: Component**

Create `components/import-prices.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FIELD_LABELS, diffPriceSheet, type SheetDiff } from "@/lib/price-diff";
import { SHEET_MAX_BYTES, parsePriceSheet } from "@/lib/price-sheet";
import type { SheetKey, StoredCategory } from "@/lib/price-types";
import { fetchPriceCatalog, importPriceChanges } from "@/lib/prices-client";
import { cn } from "@/lib/utils";

function RowTexts({ sheet }: { sheet: SheetKey }) {
  return (
    <>
      <TableCell className="whitespace-normal">{sheet.type}</TableCell>
      <TableCell className="whitespace-normal">{sheet.size}</TableCell>
      <TableCell className="whitespace-normal">{sheet.spec}</TableCell>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function formatValue(value: number | null) {
  return value === null ? "empty" : String(value);
}

export function ImportPrices() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<StoredCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SheetDiff | null>(null);
  // Indexes of changes the user unticked.
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Bumped to load the prices again (after a 409).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPriceCatalog(controller.signal)
      .then(setCatalog)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load prices",
          );
        }
      });
    return () => controller.abort();
  }, [reload]);

  const categorySheets = useMemo(
    () =>
      new Map(
        (catalog ?? []).map((category) => [category.value, category.sheet]),
      ),
    [catalog],
  );

  async function chooseFile(file: File | undefined) {
    setDiff(null);
    setFileError(null);
    setApplyError(null);
    setExcluded(new Set());
    if (!file || !catalog) {
      return;
    }
    if (file.size > SHEET_MAX_BYTES) {
      setFileError("The file is larger than 1 MB. Is it the price list?");
      return;
    }

    const parsed = parsePriceSheet(await file.text());
    if (parsed.error) {
      setFileError(parsed.error);
      return;
    }
    setDiff(diffPriceSheet(catalog, parsed.rows));
  }

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function apply() {
    if (!diff) {
      return;
    }
    const changes = diff.changes
      .filter((_, index) => !excluded.has(index))
      .map((change) => ({
        category: change.category,
        sheet: change.sheet,
        field: change.field,
        from: change.from,
        to: change.to,
      }));

    setBusy(true);
    setApplyError(null);
    try {
      const result = await importPriceChanges(changes, () =>
        getToken({ skipCache: true }),
      );
      if (!result.ok) {
        setApplyError(result.message);
        if (result.status === 409) {
          // The preview is out of date: reload prices so the file can be read again.
          setDiff(null);
          setCatalog(null);
          setReload((current) => current + 1);
        }
        return;
      }
      router.push(`/prices?imported=${result.body.updated}`);
    } catch {
      setApplyError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  const selected = diff ? diff.changes.length - excluded.size : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          In Google Sheets open the price list, then File → Download →
          Comma-separated values (.csv), and choose the file here.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={!catalog || busy}
          onChange={(event) => chooseFile(event.target.files?.[0])}
          className="text-sm"
        />
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      </div>

      {diff && (
        <>
          <Section title={`Changes (${diff.changes.length})`}>
            {diff.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every price in the file is already in the CMS.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Row</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Now → In file</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.changes.map((change, index) => (
                    <TableRow
                      key={`${change.line}:${change.field}`}
                      className={cn(excluded.has(index) && "opacity-50")}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`Apply row ${change.line} ${FIELD_LABELS[change.field]}`}
                          checked={!excluded.has(index)}
                          onChange={() => toggle(index)}
                        />
                      </TableCell>
                      <TableCell>{change.line}</TableCell>
                      <TableCell className="whitespace-normal">
                        {categorySheets.get(change.category)}
                      </TableCell>
                      <RowTexts sheet={change.sheet} />
                      <TableCell>{FIELD_LABELS[change.field]}</TableCell>
                      <TableCell>
                        {formatValue(change.from)} →{" "}
                        <span className="font-medium">
                          {formatValue(change.to)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          {diff.errors.length > 0 && (
            <Section title={`Errors (${diff.errors.length})`}>
              <p className="text-sm text-muted-foreground">
                These cells are not applied. Fix them in the spreadsheet or in
                the CMS.
              </p>
              <ul className="space-y-0.5 text-sm text-destructive">
                {diff.errors.map((error) => (
                  <li key={`${error.line}:${error.message}`}>
                    Row {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {diff.unknown.length > 0 && (
            <Section title={`Unknown rows (${diff.unknown.length})`}>
              <p className="text-sm text-muted-foreground">
                Not in the CMS, so not applied. A new item also needs
                translations on the site: add it to
                scripts/data/price-catalog.json.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Specification</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.unknown.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell>{row.line}</TableCell>
                      <TableCell className="whitespace-normal">
                        {row.category}
                      </TableCell>
                      <RowTexts sheet={row} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          )}

          {diff.missing.length > 0 && (
            <Section title={`Missing rows (${diff.missing.length})`}>
              <p className="text-sm text-muted-foreground">
                In the CMS but not in the file. Nothing is deleted.
              </p>
              <ul className="space-y-0.5 text-sm">
                {diff.missing.map((row) => (
                  <li
                    key={`${row.category}:${row.sheet.type}:${row.sheet.size}:${row.sheet.spec}`}
                  >
                    {[
                      row.categorySheet,
                      row.sheet.type,
                      row.sheet.size,
                      row.sheet.spec,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex items-center gap-3">
            <Button disabled={selected === 0 || busy} onClick={apply}>
              {busy ? "Applying…" : `Apply ${selected} changes`}
            </Button>
            {applyError && (
              <p className="text-sm text-destructive">{applyError}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/(cms)/prices/import/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ImportPrices } from "@/components/import-prices";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Import prices | Ecotrip CMS",
};

export default async function ImportPricesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href="/prices"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Prices
        </Link>
        <h1 className="text-2xl font-semibold">Import prices</h1>
      </div>
      <ImportPrices />
    </div>
  );
}
```

- [ ] **Step 3: Type check, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all tests pass. The lint rule `react-hooks/set-state-in-effect` is why the catalog reload goes through the `reload` counter instead of a `load()` call inside the effect.

- [ ] **Step 4: Check in the browser**

With `npm run dev`, open `/prices` → Import CSV, choose `lib/__fixtures__/pricelist-2026-09-17.csv`.
Expected: "Changes (2)" — the two gearbox volume rows (0.04 → 0.4), no Errors, no Unknown rows, no Missing rows. Untick both: the button reads "Apply 0 changes" and is disabled. Do not apply.

Then make a copy of the CSV, change row 14 GBP from 88 to 89 and add a row `,,Ratų komplektas,<R30,Be padangų,0.2,50,150,150,` under row 20. Choose the copy.
Expected: Changes (3) including row 14 "UK→LT (£) 88 → 89"; Unknown rows (1) with row 21.

Applying writes to the DB: only with the user's OK, apply just the row 14 change, check `/prices` shows 89 and the "Import applied: 1 changes." note, then set it back to 88 on `/prices` and Save.

- [ ] **Step 5: Commit**

```bash
npm run format
git add components/import-prices.tsx "app/(cms)/prices/import/page.tsx"
git commit -m "feat(prices): import the price list CSV with a preview"
```

---

### Task 10: README and final checks

**Files:**
- Modify: `README.md` (first line and a new section before "## Скрипты"; the scripts table)

- [ ] **Step 1: README**

Change the first paragraph to:

```markdown
Next.js 16 (App Router) + Clerk + MongoDB (Mongoose). Управление сущностями Postcodes и Prices.
```

Add this section before `## Скрипты`:

````markdown
## Цены

Раздел **Prices**: цены на перевозку, которые читает сайт ecotrip-react. Источник — Google-таблица «Ecotrip pricelist» (лист «Visos kategorijos»). Дизайн: `docs/superpowers/specs/2026-10-11-prices-design.md`.

### Структура

Коллекция `pricecategories`, один документ на категорию (типы в `lib/price-types.ts`). У категории либо подкатегории (`subCategories`), либо своя цена (`pricing`). Цена бывает трёх видов:

- `fixed`: варианты с размером и спецификацией; у каждого цена, объём и вес;
- `measured`: ступени по весу и/или объёму (`upTo` включительно, `null` только у последней); если заданы обе базы, берётся большая цена;
- `callManager`: цены нет, сайт предлагает связаться с менеджером.

Цены по направлениям: `UK-LT` в £, `LT-UK` в €. `value` у опций не меняется (его хранят заказы), `label` — ключ i18n сайта или литерал (`<R18`). Поле `sheet` хранит тексты строки таблицы, по ним работает импорт.

### Наполнение

- `npx tsx scripts/generate-price-catalog.ts "<путь к CSV>"` пересобирает `scripts/data/price-catalog.json`. Нужно только при изменении структуры (соответствие текстов таблицы и слагов сайта задано в скрипте).
- `npm run import:prices` — сухой прогон, `npm run import:prices -- --write` — вставить категории, которых нет в базе. Существующие не меняются.

### Обновление цен

**Prices → Import CSV**: в Google Sheets File → Download → Comma-separated values (.csv), затем выбрать файл. Превью показывает изменения (галочки можно снять), строки, которых нет в CMS, строки CMS, которых нет в файле, и нечитаемые ячейки. **Apply** применяет выбранное одной транзакцией. Если цены изменились после открытия превью, ответ 409, файл нужно выбрать заново.

Импорт меняет только цены, объём и вес существующих строк. Новую позицию (тип, размер) он не создаёт: ей нужны переводы на сайте. Новую категорию добавляют в `price-catalog.json` и вставляют `import:prices`; новую строку в существующей категории — через `PUT /api/prices/:category`.

### API цен

| Метод | Путь                    | Доступ    |
| ----- | ----------------------- | --------- |
| GET   | `/api/prices`           | публичный |
| PUT   | `/api/prices/:category` | admin     |
| POST  | `/api/prices/import`    | admin     |

- `GET /api/prices` → `{ categories }`, сортировка по `order`. CORS как у postcodes (`CORS_ORIGINS`).
- `PUT /api/prices/:category` принимает `{ category, updatedAt }`: категорию целиком и `updatedAt`, который клиент прочитал. Если категория с тех пор изменилась, 409. `value` менять нельзя (400), неизвестная категория — 404.
- `POST /api/prices/import` принимает `{ changes: [{ category, sheet, field, from, to }] }`, до 1000 изменений. `field`: `price.UK-LT`, `price.LT-UK`, `volume`, `weight`. Если хоть одно `from` не совпадает с текущим значением, 409 с `details.conflicts`, ничего не пишется.
````

Add two rows to the scripts table after `npm run import:postcodes -- --write`:

```markdown
| `npm run import:prices`                  | сухой прогон наполнения цен из `scripts/data/price-catalog.json` |
| `npm run import:prices -- --write`       | вставить в базу категории цен, которых там нет                  |
```

- [ ] **Step 2: Full check**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass. `npm run build` needs the Clerk and Mongo variables from `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: prices section in README"
```

---

## After this plan

Plan 2 (ecotrip-react) is written next, against the deployed `GET /api/prices`: `src/utils/priceCatalog.ts` with tests, `usePriceCatalog` with the build-time snapshot, the form switch, the one-off parity check against `products.ts`, removing the old files, and the `freestanding` i18n key. Before it: add the site's domain to `CORS_ORIGINS` on the CMS host.


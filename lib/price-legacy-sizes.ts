import type { Category, PriceOption } from "@/lib/price-types";

/**
 * Size options as ecotrip-react showed them before the CMS (its
 * src/utils/products.ts and convertSizeOptions.ts). The site sends the size
 * label with the order, and the order backend expects these exact texts, so
 * the catalog keeps them instead of the spreadsheet text. The value is the
 * same text: on a language change the site relabels a chosen option by its
 * value.
 *
 * Key: category value and subcategory value ("-" for a category without
 * subcategories); then the spreadsheet size text (`sheet.size`). Sizes not
 * listed already match the old site.
 */
export const LEGACY_SIZE_LABELS: Record<string, Record<string, string>> = {
  "automotiveGoods/setOfWheels": {
    "<R18": "R16 - R18",
    "<R22": "R19 - R22",
  },
  // The old site called the smallest engines ">1000 cm3"; kept as sent.
  "automotiveGoods/engine": {
    "<1000 cm3": ">1000 cm3",
    "<1500 cm3": "1000 - 1500 cm3",
    "<2000 cm3": "1500 - 2000 cm3",
    "<2500 cm3": "2000 - 2500 cm3",
    "<3000 cm3": "2500 - 3000 cm3",
    "<3500 cm3": "3000 - 3500 cm3",
    "<4000 cm3": "3500 - 4000 cm3",
  },
  "automotiveGoods/gearbox": {
    "<1000 cm3": ">1000 cm3",
    "<1500 cm3": "1000 - 1500 cm3",
    "<2000 cm3": "1500 - 2000 cm3",
    "<2500 cm3": "2000 - 2500 cm3",
    "<3000 cm3": "2500 - 3000 cm3",
    "<3500 cm3": "3000 - 3500 cm3",
    "<4000 cm3": "3500 - 4000 cm3",
  },
  "bicyclesAndScooters/electricScooter": {
    "<25 km/h": "<25 unit",
    ">25 km/h": ">25 unit",
  },
  "motorcyclesAndAccessories/scooterMoped": {
    "<50 cm3": "<49 cm3",
    "<125 cm3": "50 - 125 cm3",
    "<250 cm3": "125 - 250 cm3",
  },
  "motorcyclesAndAccessories/standardMotorcycle": {
    "<750 cm3": "500 - 750 cm3",
    "<1000 cm3": "750 - 1000 cm3",
  },
  "motorcyclesAndAccessories/motocrossMotorcycle": {
    "<250 cm3": "125 - 249 cm3",
    "<450 cm3": "250 - 449 cm3",
  },
  "motorcyclesAndAccessories/touringMotorcycle": {
    "<1200 cm3": "800 - 1199 cm3",
    "<1600 cm3": "1200 - 1599 cm3",
  },
  "motorcyclesAndAccessories/sportsMotorcycle": {
    "<1000 cm3": "600 - 1000 cm3",
  },
  "motorcyclesAndAccessories/chopper": {
    "<1200 cm3": "800 - 1199 cm3",
  },
  "motorcyclesAndAccessories/enduro": {
    "<650 cm3": "250 - 649 cm3",
    "<1200 cm3": "650 - 1200 cm3",
  },
  "motorcyclesAndAccessories/quadBike": {
    "<800 cm3": "400 - 799 cm3",
    "<1200 cm3": "800 - 1200 cm3",
  },
  "motorcyclesAndAccessories/motorcycleEngine": {
    "<250 cm3": "45 - 249 cm3",
    "<450 cm3": "250 - 450 cm3",
    "<600 cm3": "450 - 600 cm3",
    "<1000 cm3": "600 - 1000 cm3",
    "<1200 cm3": "1000 - 1200 cm3",
    "<1600 cm3": "1200 - 1600 cm3",
  },
  "flatScreenTv/-": {
    "<24 coliai": "<23 inch",
    "<32 coliai": "23 - 31 inch",
    "<40 coliai": "32 - 39 inch",
    "<43 coliai": "40 - 42 inch",
    "<50 coliai": "43 - 49 inch",
    "<55 coliai": "50 - 54 inch",
    "<65 coliai": "55 - 64 inch",
    "<70 coliai": "65 - 69 inch",
    "<75 coliai": "70 - 74 inch",
    "<85 coliai": "75 - 84 inch",
  },
  "gardenEquipment/smallGardenTractor": {
    "Pjovimo skersmuo <80 cm": "<79 cm",
  },
  "gardenEquipment/averageGardenTractor": {
    "Pjovimo skersmuo <120 cm": "80 - 119 cm",
  },
};

// The old site's option for a spreadsheet size, or undefined when the size
// is not listed.
export function legacySizeOption(
  category: string,
  subCategory: string | null,
  sheetSize: string,
): PriceOption | undefined {
  const text =
    LEGACY_SIZE_LABELS[`${category}/${subCategory ?? "-"}`]?.[sheetSize];
  return text === undefined ? undefined : { value: text, label: text };
}

export type LegacySizeChange = {
  category: string;
  subCategory: string | null;
  sheetSize: string;
  from: PriceOption | null;
  to: PriceOption;
};

/**
 * Copies of the categories with every listed size set to the old site's
 * option, and what changed. Applying it again changes nothing.
 */
export function applyLegacySizes(categories: Category[]): {
  categories: Category[];
  changes: LegacySizeChange[];
} {
  const copies = structuredClone(categories);
  const changes: LegacySizeChange[] = [];

  for (const category of copies) {
    const pricings = [
      { subCategory: null, pricing: category.pricing },
      ...category.subCategories.map((sub) => ({
        subCategory: sub.value,
        pricing: sub.pricing,
      })),
    ];
    for (const { subCategory, pricing } of pricings) {
      if (pricing?.type !== "fixed") {
        continue;
      }
      for (const variant of pricing.variants) {
        const legacy = legacySizeOption(
          category.value,
          subCategory,
          variant.sheet.size,
        );
        if (
          legacy &&
          (variant.size?.value !== legacy.value ||
            variant.size?.label !== legacy.label)
        ) {
          changes.push({
            category: category.value,
            subCategory,
            sheetSize: variant.sheet.size,
            from: variant.size,
            to: legacy,
          });
          variant.size = legacy;
        }
      }
    }
  }
  return { categories: copies, changes };
}

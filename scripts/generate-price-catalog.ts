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

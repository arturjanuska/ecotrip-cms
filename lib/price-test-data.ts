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

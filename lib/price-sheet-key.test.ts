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

/**
 * One-off update of the stored price categories: size options get back the
 * texts the site sent before the CMS (lib/price-legacy-sizes.ts), so orders
 * keep their format.
 *
 *   npm run migrate:price-sizes             dry run: report only
 *   npm run migrate:price-sizes -- --write  update the categories
 *
 * Only the size value and label change; prices, volumes and the spreadsheet
 * texts stay. Safe to re-run.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { applyLegacySizes } from "@/lib/price-legacy-sizes";
import type { Category } from "@/lib/price-types";

loadEnvConfig(process.cwd());

const write = process.argv.includes("--write");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (.env.local)");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Target: host=${host} db=${name} collection=pricecategories`);

  const collection = mongoose.connection.collection("pricecategories");
  const stored = (await collection
    .find({})
    .toArray()) as unknown as (Category & {
    _id: mongoose.Types.ObjectId;
  })[];
  const { categories, changes } = applyLegacySizes(stored);

  console.log(`Size options to update: ${changes.length}`);
  for (const change of changes) {
    console.log(
      `  - ${change.category}/${change.subCategory ?? "-"} "${change.sheetSize}": ` +
        `${change.from?.value ?? "(none)"} -> ${change.to.value}`,
    );
  }

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to update.");
    return;
  }

  const touched = new Set(changes.map((change) => change.category));
  const now = new Date();
  let updated = 0;
  for (const category of categories) {
    if (!touched.has(category.value)) {
      continue;
    }
    const result = await collection.updateOne(
      { value: category.value },
      {
        $set: {
          subCategories: category.subCategories,
          pricing: category.pricing,
          updatedAt: now,
        },
      },
    );
    updated += result.modifiedCount;
  }
  console.log(`\nDone. Categories updated: ${updated}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

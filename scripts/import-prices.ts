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

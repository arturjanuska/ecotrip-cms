/**
 * One-off import of scripts/data/ukPostCodesv2.ts into the `postcodes` collection.
 *
 *   npm run import:postcodes             dry run: report only, nothing is written
 *   npm run import:postcodes -- --write  insert records that are not in the DB yet
 *
 * Insert-only: postcodes that already exist are skipped, so a re-run never
 * overwrites edits made in the CMS. Rows are written with the native driver so
 * an empty `town` is allowed (the API still requires it for new records).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";

loadEnvConfig(process.cwd());

const SOURCE = path.join(process.cwd(), "scripts", "data", "ukPostCodesv2.ts");
const BATCH_SIZE = 1000;
const PRICELIST = "Parcel force pricelist";

const FIELDS = [
  "postcode",
  "town",
  "region",
  "country",
  "countryString",
  "basicPrice",
  "additionalCharges",
  "parcelForceZone",
  "discount",
  "calendar",
] as const;

type Field = (typeof FIELDS)[number];
type Row = Record<Field, string> & { isParcelForce: boolean };

const write = process.argv.includes("--write");

function readSourceRows(): Record<string, unknown>[] {
  const source = fs.readFileSync(SOURCE, "utf8");
  const literal = source
    .replace(/^\s*const\s+UK_POST_CODES\s*=\s*/, "")
    .replace(/;\s*$/, "");

  return vm.runInNewContext(`(${literal})`);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (.env.local)");
  }

  const raw = readSourceRows();
  const stats = {
    source: raw.length,
    invalid: [] as string[],
    duplicatesInFile: 0,
    fixedCountry: 0,
    parcelForce: 0,
    emptyTown: 0,
  };

  const rows = new Map<string, Row>();
  for (const item of raw) {
    const row = {} as Row;
    for (const field of FIELDS) {
      const value = item[field];
      row[field] = typeof value === "string" ? value.trim() : "";
    }
    row.postcode = row.postcode.toUpperCase();

    if (row.postcode === "M90" && !row.country) {
      row.country = "ENG";
      row.countryString = "England";
      stats.fixedCountry += 1;
    }
    // The source marks ParcelForce areas in additionalCharges (any casing);
    // the CMS has isParcelForce for that and keeps additionalCharges a number.
    row.isParcelForce =
      row.additionalCharges.toLowerCase() === PRICELIST.toLowerCase();
    if (row.isParcelForce) {
      row.additionalCharges = "";
      stats.parcelForce += 1;
    }

    if (!row.postcode || !row.country) {
      stats.invalid.push(
        `${row.postcode || "(no postcode)"}: missing ${
          row.postcode ? "country" : "postcode"
        }`,
      );
      continue;
    }

    if (rows.has(row.postcode)) {
      stats.duplicatesInFile += 1;
    }
    rows.set(row.postcode, row);
  }
  stats.emptyTown = [...rows.values()].filter((row) => !row.town).length;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Target: host=${host} db=${name} collection=postcodes`);

  const collection = mongoose.connection.collection("postcodes");
  const postcodes = [...rows.keys()];

  const existing = new Set<string>();
  for (const part of chunk(postcodes, BATCH_SIZE)) {
    const found = await collection
      .find({ postcode: { $in: part } }, { projection: { postcode: 1 } })
      .toArray();
    for (const doc of found) {
      existing.add(doc.postcode as string);
    }
  }

  const toInsert = [...rows.values()].filter(
    (row) => !existing.has(row.postcode),
  );

  console.log(`Rows in file:             ${stats.source}`);
  console.log(`Invalid (skipped):        ${stats.invalid.length}`);
  for (const message of stats.invalid) {
    console.log(`  - ${message}`);
  }
  console.log(`Duplicates in file:       ${stats.duplicatesInFile}`);
  console.log(`Fixed M90 country:        ${stats.fixedCountry}`);
  console.log(`ParcelForce areas:        ${stats.parcelForce}`);
  console.log(`Unique valid postcodes:   ${rows.size}`);
  console.log(`  with empty town:        ${stats.emptyTown}`);
  console.log(`Already in DB (skipped):  ${existing.size}`);
  console.log(`To insert:                ${toInsert.length}`);

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to insert.");
    return;
  }

  await collection.createIndex({ postcode: 1 }, { unique: true });

  let inserted = 0;
  const now = new Date();
  for (const part of chunk(toInsert, BATCH_SIZE)) {
    const docs = part.map((row) => ({
      ...row,
      active: true,
      createdAt: now,
      updatedAt: now,
    }));
    const result = await collection.insertMany(docs, { ordered: false });
    inserted += result.insertedCount;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const total = await collection.countDocuments({});
  const active = await collection.countDocuments({ active: true });
  console.log(
    `\nDone. Inserted ${inserted}. In DB: ${total} total, ${active} active.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

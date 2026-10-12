/**
 * One-off move of the ParcelForce mark from `additionalCharges` to
 * `isParcelForce`.
 *
 *   npm run migrate:parcel-force             dry run: report only
 *   npm run migrate:parcel-force -- --write  update the postcodes
 *
 * "Parcel force pricelist" (any casing) in additionalCharges becomes
 * isParcelForce: true and an empty additionalCharges; every other postcode
 * gets isParcelForce: false. Safe to re-run. Values left in additionalCharges
 * that are not numbers are listed: fix them in the CMS.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { isValidAdditionalCharges } from "@/lib/postcode-options";

loadEnvConfig(process.cwd());

const PRICELIST = /^\s*parcel force pricelist\s*$/i;

const write = process.argv.includes("--write");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (.env.local)");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Target: host=${host} db=${name} collection=postcodes`);

  const collection = mongoose.connection.collection("postcodes");
  const marked = { additionalCharges: { $regex: PRICELIST } };
  const unset = { isParcelForce: { $exists: false } };

  const toMark = await collection.countDocuments(marked);
  const toClear = await collection.countDocuments({
    ...unset,
    additionalCharges: { $not: PRICELIST },
  });
  const notNumbers = (
    await collection
      .find(
        { additionalCharges: { $not: PRICELIST } },
        { projection: { postcode: 1, additionalCharges: 1 } },
      )
      .toArray()
  ).filter(
    (doc) => !isValidAdditionalCharges(String(doc.additionalCharges ?? "")),
  );

  console.log(`ParcelForce areas to mark:         ${toMark}`);
  console.log(`Other postcodes to mark as not:    ${toClear}`);
  console.log(`Not a number in additionalCharges: ${notNumbers.length}`);
  for (const doc of notNumbers) {
    console.log(`  - ${doc.postcode}: "${doc.additionalCharges}"`);
  }

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to update.");
    return;
  }

  const now = new Date();
  const parcelForce = await collection.updateMany(marked, {
    $set: { isParcelForce: true, additionalCharges: "", updatedAt: now },
  });
  const others = await collection.updateMany(
    { ...unset, additionalCharges: { $not: PRICELIST } },
    { $set: { isParcelForce: false, updatedAt: now } },
  );

  console.log(
    `\nDone. ParcelForce: ${parcelForce.modifiedCount}, others: ${others.modifiedCount}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

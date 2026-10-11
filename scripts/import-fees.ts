/**
 * Fills the `feesettings` collection from scripts/data/fee-settings.ts.
 *
 *   npm run import:fees             dry run: report only, nothing is written
 *   npm run import:fees -- --write  insert the settings when there are none
 *
 * Insert-only, like import:prices: a re-run never overwrites CMS edits.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { feeSettingsSchema } from "@/lib/validation/fees";
import { INITIAL_FEE_SETTINGS } from "./data/fee-settings";

loadEnvConfig(process.cwd());

const write = process.argv.includes("--write");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set (.env.local)");
  }

  const parsed = feeSettingsSchema.safeParse(INITIAL_FEE_SETTINGS);
  if (!parsed.success) {
    throw new Error(
      `fee-settings.ts is invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }
  const settings = parsed.data;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Target: host=${host} db=${name} collection=feesettings`);

  const collection = mongoose.connection.collection("feesettings");
  const exists = (await collection.countDocuments({}, { limit: 1 })) > 0;

  console.log(
    exists
      ? "Fees are already in the DB: nothing to insert."
      : "Fees are not in the DB yet: to insert.",
  );

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to insert.");
    return;
  }

  if (!exists) {
    const now = new Date();
    await collection.insertOne({ ...settings, createdAt: now, updatedAt: now });
  }
  console.log(`\nDone. Inserted ${exists ? 0 : 1}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

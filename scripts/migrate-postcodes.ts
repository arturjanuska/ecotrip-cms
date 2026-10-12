/**
 * One-off update of the stored postcodes to the current shape.
 *
 *   npm run migrate:postcodes             dry run: report only
 *   npm run migrate:postcodes -- --write  update the postcodes
 *
 * - "Parcel force pricelist" (any casing) in additionalCharges becomes
 *   isParcelForce: true; every other postcode gets isParcelForce: false.
 * - An empty (or missing) additionalCharges or discount becomes "0".
 *
 * Safe to re-run. Values left that are not valid numbers are listed: fix them
 * in the CMS.
 */
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import {
  NUMBER_DEFAULT,
  isValidAdditionalCharges,
  isValidDiscount,
} from "@/lib/postcode-options";

loadEnvConfig(process.cwd());

const PRICELIST = /^\s*parcel force pricelist\s*$/i;
// Also matches a missing field.
const EMPTY = { $in: ["", null] };

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
  const parcelForce = { additionalCharges: { $regex: PRICELIST } };
  const notMarked = {
    isParcelForce: { $exists: false },
    additionalCharges: { $not: PRICELIST },
  };
  const emptyCharges = { additionalCharges: EMPTY };
  const emptyDiscount = { discount: EMPTY };

  const counts = {
    parcelForce: await collection.countDocuments(parcelForce),
    notMarked: await collection.countDocuments(notMarked),
    emptyCharges: await collection.countDocuments(emptyCharges),
    emptyDiscount: await collection.countDocuments(emptyDiscount),
  };
  // Values the updates below do not fix: they need a hand in the CMS.
  const invalid = (
    await collection
      .find(
        {},
        { projection: { postcode: 1, additionalCharges: 1, discount: 1 } },
      )
      .toArray()
  ).flatMap((doc) => {
    const charges = String(doc.additionalCharges ?? "");
    const discount = String(doc.discount ?? "");
    const problems = [];
    if (
      charges.trim() !== "" &&
      !PRICELIST.test(charges) &&
      !isValidAdditionalCharges(charges)
    ) {
      problems.push(`additionalCharges "${charges}"`);
    }
    if (discount.trim() !== "" && !isValidDiscount(discount)) {
      problems.push(`discount "${discount}"`);
    }
    return problems.length > 0
      ? [`${doc.postcode}: ${problems.join(", ")}`]
      : [];
  });

  console.log(`ParcelForce areas to mark:          ${counts.parcelForce}`);
  console.log(`Other postcodes to mark as not:     ${counts.notMarked}`);
  console.log(
    `Empty additionalCharges (and ParcelForce marks) to set to 0: ${
      counts.emptyCharges + counts.parcelForce
    }`,
  );
  console.log(`Empty discount to set to 0:         ${counts.emptyDiscount}`);
  console.log(`Not a valid number:                 ${invalid.length}`);
  for (const line of invalid) {
    console.log(`  - ${line}`);
  }

  if (!write) {
    console.log("\nDry run. Nothing written. Re-run with --write to update.");
    return;
  }

  const now = new Date();
  const marked = await collection.updateMany(parcelForce, {
    $set: {
      isParcelForce: true,
      additionalCharges: NUMBER_DEFAULT,
      updatedAt: now,
    },
  });
  const others = await collection.updateMany(notMarked, {
    $set: { isParcelForce: false, updatedAt: now },
  });
  const charges = await collection.updateMany(emptyCharges, {
    $set: { additionalCharges: NUMBER_DEFAULT, updatedAt: now },
  });
  const discounts = await collection.updateMany(emptyDiscount, {
    $set: { discount: NUMBER_DEFAULT, updatedAt: now },
  });

  console.log(
    `\nDone. ParcelForce: ${marked.modifiedCount}, others: ${
      others.modifiedCount
    }, additionalCharges set to 0: ${charges.modifiedCount}, discount set to 0: ${
      discounts.modifiedCount
    }.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

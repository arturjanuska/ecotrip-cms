import "server-only";
import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB() {
  if (cache.conn) {
    return cache.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    // Fail fast (503) instead of hanging for the 30 s default when Atlas is unreachable.
    serverSelectionTimeoutMS: 5000,
    // Each serverless instance keeps its own pool; the default of 100 adds up fast on Atlas.
    maxPoolSize: 10,
  });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}

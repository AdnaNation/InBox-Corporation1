import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Please define MONGODB_URI in .env.local");

// Vercel may reuse a function process across many requests. Reuse one client
// promise per process instead of opening a new pool for every module instance.
const globalForMongo = globalThis;
const mongoClientOptions = {
  appName: "inbox-corporation",
  maxPoolSize: 5,
  minPoolSize: 0,
  maxConnecting: 2,
  maxIdleTimeMS: 30_000,
  connectTimeoutMS: 10_000,
  serverSelectionTimeoutMS: 10_000,
  retryReads: true,
  retryWrites: true,
};

if (!globalForMongo._mongoClientPromise) {
  const client = new MongoClient(uri, mongoClientOptions);
  const connectionPromise = client.connect().catch(async (error) => {
    await client.close().catch(() => {});
    if (globalForMongo._mongoClientPromise === connectionPromise) {
      delete globalForMongo._mongoClientPromise;
    }
    throw error;
  });
  globalForMongo._mongoClientPromise = connectionPromise;
}

export default globalForMongo._mongoClientPromise;

import { MongoClient } from "mongodb";
import { createMongoClientProvider } from "@/lib/mongo-client-provider.mjs";

const uri = process.env.MONGODB_URI;
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

// Connect only when a request actually needs MongoDB. This avoids opening a
// pool during module evaluation for unauthenticated requests and build-time
// imports, while preserving one shared connection promise per warm process.
const getMongoClient = createMongoClientProvider({
  MongoClient,
  uri,
  options: mongoClientOptions,
});

export default getMongoClient;

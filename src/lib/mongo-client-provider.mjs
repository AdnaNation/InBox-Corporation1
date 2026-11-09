export function createMongoClientProvider({
  MongoClient,
  uri,
  options,
  state = globalThis,
  cacheKey = "_mongoClientPromise",
}) {
  if (!uri) throw new Error("Please define MONGODB_URI in the server environment");

  return async function getMongoClient() {
    if (!state[cacheKey]) {
      const client = new MongoClient(uri, options);
      const connectionPromise = client.connect().catch(async (error) => {
        await client.close().catch(() => {});
        if (state[cacheKey] === connectionPromise) {
          delete state[cacheKey];
        }
        throw error;
      });
      state[cacheKey] = connectionPromise;
    }

    return state[cacheKey];
  };
}

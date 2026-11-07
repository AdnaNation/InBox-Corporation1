import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureMongoIndex } from "../../src/lib/mongo-indexes.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run MongoDB index cache integration tests.");

const client = new MongoClient(mongoUri);
const databaseName = "wavo_mongo_index_cache_" + new ObjectId().toString();
let db;

before(async () => {
  await client.connect();
  db = client.db(databaseName);
});

after(async () => {
  if (db) await db.dropDatabase();
  await client.close();
});

test("caches index creation across Db handles and keeps databases isolated", async () => {
  const first = client.db(databaseName);
  const second = client.db(databaseName);
  const other = client.db(databaseName + "_other");
  try {
    await Promise.all([
      ensureMongoIndex(first, "records", { workspaceId: 1, createdAt: -1 }, { name: "workspace_records" }),
      ensureMongoIndex(second, "records", { workspaceId: 1, createdAt: -1 }, { name: "workspace_records" }),
      ensureMongoIndex(other, "records", { workspaceId: 1, createdAt: -1 }, { name: "workspace_records" }),
    ]);

    const [firstIndexes, otherIndexes] = await Promise.all([
      first.collection("records").listIndexes().toArray(),
      other.collection("records").listIndexes().toArray(),
    ]);
    assert.ok(firstIndexes.some((index) => index.name === "workspace_records"));
    assert.ok(otherIndexes.some((index) => index.name === "workspace_records"));
  } finally {
    await client.db(databaseName + "_other").dropDatabase();
  }
});

test("clears rejected index promises so a corrected definition can retry", async () => {
  const collection = db.collection("retry_records");
  await collection.createIndex({ value: 1 }, { name: "retryable_index" });

  await assert.rejects(
    ensureMongoIndex(db, "retry_records", { other: 1 }, { name: "retryable_index" }),
  );

  await collection.dropIndex("retryable_index");
  const created = await ensureMongoIndex(db, "retry_records", { other: 1 }, { name: "retryable_index" });
  assert.equal(created, "retryable_index");
});

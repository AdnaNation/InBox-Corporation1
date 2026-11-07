import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import {
  buildContactHistoryFilter,
  decodeContactCursor,
  encodeContactCursor,
} from "../../src/lib/contact-pagination.mjs";
import {
  buildCampaignHistoryFilter,
  decodeCampaignCursor,
  encodeCampaignCursor,
} from "../../src/lib/campaign-pagination.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run public API integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [new ObjectId(), new ObjectId()];
const createdAt = new Date("2026-11-07T08:00:00.000Z");
const ids = [
  "672000000000000000000001",
  "672000000000000000000002",
  "672000000000000000000003",
  "672000000000000000000004",
].map((id) => new ObjectId(id));

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db) {
    await Promise.all([
      db.collection("contacts").deleteMany({ workspaceId: { $in: workspaceIds } }),
      db.collection("campaigns").deleteMany({ workspaceId: { $in: workspaceIds } }),
    ]);
  }
  await client.close();
});

async function assertStablePages({ collection, workspaceId, otherWorkspaceId, documents, buildFilter, encode, decode }) {
  await collection.insertMany(documents);
  const firstRows = await collection.find(buildFilter(workspaceId))
    .sort({ createdAt: -1, _id: -1 }).limit(3).toArray();
  const firstPage = firstRows.slice(0, 2);
  assert.equal(firstRows.length, 3, "limit + 1 should detect another page");
  assert.deepEqual(firstPage.map((row) => row._id.toString()), [ids[2].toString(), ids[1].toString()]);

  const cursor = decode(encode(firstPage[firstPage.length - 1]));
  assert.ok(cursor);
  const secondRows = await collection.find(buildFilter(workspaceId, cursor))
    .sort({ createdAt: -1, _id: -1 }).limit(3).toArray();

  const allIds = [...firstPage, ...secondRows].map((row) => row._id.toString());
  assert.deepEqual(allIds, [ids[2].toString(), ids[1].toString(), ids[0].toString()]);
  assert.equal(new Set(allIds).size, allIds.length, "pagination must not duplicate records");
  assert.ok(!allIds.includes(ids[3].toString()), "another workspace's record must never appear");
  assert.equal(await collection.countDocuments(buildFilter(otherWorkspaceId)), 1);
}

test("contact history query paginates tied timestamps without leaking workspace records", async () => {
  await assertStablePages({
    collection: db.collection("contacts"),
    workspaceId: workspaceIds[0],
    otherWorkspaceId: workspaceIds[1],
    documents: [
      { _id: ids[0], workspaceId: workspaceIds[0], createdAt, phone: "+15550000001" },
      { _id: ids[1], workspaceId: workspaceIds[0], createdAt, phone: "+15550000002" },
      { _id: ids[2], workspaceId: workspaceIds[0], createdAt, phone: "+15550000003" },
      { _id: ids[3], workspaceId: workspaceIds[1], createdAt, phone: "+15550000004" },
    ],
    buildFilter: (workspaceId, cursor) => buildContactHistoryFilter(workspaceId, cursor),
    encode: encodeContactCursor,
    decode: decodeContactCursor,
  });
});

test("campaign history query paginates tied timestamps and preserves status/workspace filters", async () => {
  await assertStablePages({
    collection: db.collection("campaigns"),
    workspaceId: workspaceIds[0],
    otherWorkspaceId: workspaceIds[1],
    documents: [
      { _id: ids[0], workspaceId: workspaceIds[0], createdAt, status: "draft" },
      { _id: ids[1], workspaceId: workspaceIds[0], createdAt, status: "draft" },
      { _id: ids[2], workspaceId: workspaceIds[0], createdAt, status: "draft" },
      { _id: ids[3], workspaceId: workspaceIds[1], createdAt, status: "draft" },
    ],
    buildFilter: (workspaceId, cursor) => buildCampaignHistoryFilter(workspaceId, cursor),
    encode: encodeCampaignCursor,
    decode: decodeCampaignCursor,
  });

  const statusFilter = buildCampaignHistoryFilter(workspaceIds[0], null, "completed");
  assert.equal(statusFilter.status, "completed");
  assert.equal(statusFilter.workspaceId.toString(), workspaceIds[0].toString());
});

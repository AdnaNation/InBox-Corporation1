import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { getActiveWhatsAppAccount } from "../../src/lib/whatsapp-account.js";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run WhatsApp account routing integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && workspaceIds.length) {
    await db.collection("whatsappAccounts").deleteMany({ workspaceId: { $in: workspaceIds } });
  }
  await client.close();
});

test("campaign routing resolves its originally assigned connected number, not the currently active number", async () => {
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const originalNumberId = "test-original-" + workspaceId.toString();
  const newlyActiveNumberId = "test-active-" + workspaceId.toString();

  await db.collection("whatsappAccounts").insertMany([
    {
      workspaceId,
      phoneNumberId: originalNumberId,
      wabaId: "test-waba-original",
      accessTokenEncrypted: "encrypted-original",
      status: "connected",
      isActive: false,
      createdAt: new Date(0),
    },
    {
      workspaceId,
      phoneNumberId: newlyActiveNumberId,
      wabaId: "test-waba-active",
      accessTokenEncrypted: "encrypted-active",
      status: "connected",
      isActive: true,
      createdAt: new Date(),
    },
  ]);

  const campaignAccount = await getActiveWhatsAppAccount(db, workspaceId, originalNumberId);
  const activeAccount = await getActiveWhatsAppAccount(db, workspaceId);

  assert.equal(campaignAccount.phoneNumberId, originalNumberId);
  assert.equal(campaignAccount.wabaId, "test-waba-original");
  assert.equal(activeAccount.phoneNumberId, newlyActiveNumberId);
});

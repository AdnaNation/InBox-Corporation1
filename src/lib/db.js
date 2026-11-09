import getMongoClient from "@/lib/mongodb";

export async function getDatabase() {
  const client = await getMongoClient();
  return client.db("whatsapp_saas");
}

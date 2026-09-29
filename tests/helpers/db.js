import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Throwaway in-memory MongoDB for tests.
 *
 * Usage in a test file:
 *   beforeAll(connectTestDB);
 *   afterEach(clearTestDB);
 *   afterAll(closeTestDB);
 */
let mongoServer;

export async function connectTestDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // Build unique/partial indexes up front so tests that rely on them
  // (duplicate checks, one-active-issue-per-book, etc.) behave like production.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

export async function clearTestDB() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function closeTestDB() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

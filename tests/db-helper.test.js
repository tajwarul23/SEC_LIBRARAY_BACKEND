import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { Book } from "../src/models/book-model.js";

/**
 * Beginner-Friendly Test: In-memory test database
 *
 * Purpose: Make sure the throwaway MongoDB used by DB-backed tests works,
 * including unique indexes (which later tests rely on).
 */
describe("Test helper: in-memory MongoDB", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  const sampleBook = {
    title: "Introduction to Algorithms",
    authors: ["Thomas H. Cormen"],
    isbn: "9780262033848",
    totalCopies: 2,
    availableCopies: 2,
  };

  test("should save and read back a document", async () => {
    await Book.create(sampleBook);

    const found = await Book.findOne({ isbn: "9780262033848" }).lean();

    expect(found.title).toBe("Introduction to Algorithms");
  });

  test("should enforce unique indexes (duplicate ISBN rejected)", async () => {
    await Book.create(sampleBook);

    await expect(Book.create(sampleBook)).rejects.toMatchObject({ code: 11000 });
  });

  test("should start each test with an empty database", async () => {
    expect(await Book.countDocuments()).toBe(0);
  });
});

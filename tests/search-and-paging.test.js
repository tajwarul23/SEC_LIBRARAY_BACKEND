import request from "supertest";
import app from "../src/app.js";
import ResearchPaper from "../src/models/research-paper-model.js";
import { Book } from "../src/models/book-model.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createAdmin, createStudent, createRosterEntry, adminCookie, studentCookie } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Safe search input and page-size caps
 *
 * Purpose: Typed search text must be matched literally (symbols like "("
 * used to crash research search), and no request may ask for more than
 * 100 items at once.
 */
describe("Search input is matched literally", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  const addPaper = (title) =>
    ResearchPaper.create({
      title,
      authors: [{ name: "Some Author" }],
      category: "CSE",
      paperLink: `https://example.com/${encodeURIComponent(title)}`,
      status: "approved",
    });

  test("student research search with an unclosed bracket works instead of crashing", async () => {
    const student = await createStudent();
    await addPaper("Operating Systems (3rd ed)");

    const res = await request(app)
      .get("/api/student/access/research-papers/search")
      .query({ query: "Systems (3rd" })
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(200);
    expect(res.body.papers).toHaveLength(1);
  });

  test("pattern characters are not treated as wildcards", async () => {
    const student = await createStudent();
    await addPaper("Compiler Design");

    const res = await request(app)
      .get("/api/student/access/research-papers/search")
      .query({ query: ".*" })
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(200);
    expect(res.body.papers).toHaveLength(0);
  });

  test("admin roster search with symbols works instead of crashing", async () => {
    const admin = await createAdmin();
    await createRosterEntry();

    const res = await request(app)
      .post("/api/main/student/search")
      .set("Cookie", adminCookie(admin))
      .send({ query: "Chowdhury (" });

    expect(res.status).toBe(200);
  });

  test("admin student lookup rejects a non-text regNo (NoSQL injection attempt)", async () => {
    const admin = await createAdmin();
    await createStudent();

    const res = await request(app)
      .post("/api/admin/access/students/search")
      .set("Cookie", adminCookie(admin))
      .send({ regNo: { $ne: null } });

    expect(res.status).toBe(400);
  });
});

describe("Page sizes are capped at 100", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  test("admin book list", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .get("/api/admin/access/books")
      .query({ limit: 1000000 })
      .set("Cookie", adminCookie(admin));

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  test("admin list with a nonsense or negative limit/offset falls back to defaults", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .get("/api/admin/access/issued")
      .query({ limit: "abc", offset: -5 })
      .set("Cookie", adminCookie(admin));

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(3);
    expect(res.body.offset).toBe(0);
  });

  test("student book list", async () => {
    const student = await createStudent();
    await Book.create({
      title: "Clean Code",
      authors: ["Robert C. Martin"],
      isbn: "9780132350884",
      totalCopies: 1,
      availableCopies: 1,
    });

    const res = await request(app)
      .get("/api/student/access/books")
      .query({ limit: 1000000 })
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  test("student notifications", async () => {
    const student = await createStudent();

    const res = await request(app)
      .get("/api/student/notifications")
      .query({ limit: 1000000 })
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });
});

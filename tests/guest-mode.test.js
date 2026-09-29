import request from "supertest";
import app from "../src/app.js";
import Admin from "../src/models/admin-model.js";
import User from "../src/models/user-auth-models.js";
import StudentAuthentication from "../src/models/student-authentication-model.js";
import ResearchPaper from "../src/models/research-paper-model.js";
import { Book } from "../src/models/book-model.js";
import { ReserveBook } from "../src/models/reserve-book.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createRosterEntry, createStudent, setCookieNames } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Guest mode (read-only visitors)
 *
 * Purpose: "Continue as Guest" on either portal lets anyone look around,
 * but the backend must refuse every change, whatever the UI shows.
 */
const addBook = () =>
  Book.create({
    title: "Clean Code",
    authors: ["Robert C. Martin"],
    isbn: "9780132350884",
    totalCopies: 2,
    availableCopies: 2,
  });

const addPaper = (overrides = {}) =>
  ResearchPaper.create({
    title: "Pending Paper",
    authors: [{ name: "Some Author" }],
    category: "CSE",
    paperLink: "https://example.com/paper",
    status: "pending",
    ...overrides,
  });

async function adminGuest() {
  const agent = request.agent(app);
  const res = await agent.post("/api/admin/guest");
  expect(res.status).toBe(200);
  expect(setCookieNames(res)).toEqual(["admin_token"]);
  return agent;
}

async function studentGuest() {
  const agent = request.agent(app);
  const res = await agent.post("/api/user/guest");
  expect(res.status).toBe(200);
  expect(setCookieNames(res)).toEqual(["student_token"]);
  return agent;
}

describe("Guest mode: admin portal", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  test("guest login creates no database records and /me reports a guest", async () => {
    const agent = await adminGuest();

    const me = await agent.get("/api/admin/me");

    expect(me.status).toBe(200);
    expect(me.body.data.admin.role).toBe("guest");
    expect(await Admin.countDocuments()).toBe(0);
  });

  test("guest can read every admin page", async () => {
    const agent = await adminGuest();
    await addBook();
    await createStudent();

    for (const path of [
      "/api/admin/access/books",
      "/api/admin/access/students",
      "/api/admin/access/issued",
      "/api/admin/access/reservations",
      "/api/admin/access/payments",
      "/api/admin/access/stats/books",
      "/api/admin/access/research-papers",
      "/api/main/student/all",
    ]) {
      const res = await agent.get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  test("guest sees student details unmasked (as chosen for demo data)", async () => {
    const agent = await adminGuest();
    await createStudent({ name: "Tajwarul Chowdhury", email: "real@test.com" });

    const res = await agent.get("/api/admin/access/students");

    expect(res.body.data[0].name).toBe("Tajwarul Chowdhury");
    expect(res.body.data[0].email).toBe("real@test.com");
  });

  test("guest sees pending research papers like an admin does", async () => {
    const agent = await adminGuest();
    await addPaper();

    const res = await agent.get("/api/admin/access/research-papers/search");

    expect(res.status).toBe(200);
    expect(res.body.papers).toHaveLength(1);
  });

  test("every kind of change is refused with 403 and nothing changes", async () => {
    const agent = await adminGuest();
    const book = await addBook();
    const paper = await addPaper();
    const roster = await createRosterEntry();

    const attempts = [
      agent.post("/api/admin/access/books").send({ title: "X", authors: ["Y"], isbn: "9780262033848", totalCopies: 1, availableCopies: 1 }),
      agent.patch(`/api/admin/access/books/${book._id}`).send({ title: "Hacked" }),
      agent.delete(`/api/admin/access/books/${book._id}`),
      agent.post(`/api/admin/access/books/${book._id}/issue-to`).send({ regNo: "2021331001" }),
      agent.post(`/api/admin/access/research-papers/approve/${paper._id}`),
      agent.delete(`/api/admin/access/research-papers/${paper._id}`),
      agent.post("/api/main/student/add").send({ name: "N", gmail: "n@test.com", regNo: "1", gender: "Male", Session: "s", department: "d" }),
      agent.delete(`/api/main/student/delete/${roster._id}`),
      agent.post("/api/admin/register").send({ name: "Evil", email: "e@test.com", regNo: "evil1", password: "EvilPass123" }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect({ url: res.req.path, status: res.status }).toEqual({ url: res.req.path, status: 403 });
    }

    const bookAfter = await Book.findById(book._id).lean();
    expect(bookAfter.title).toBe("Clean Code");
    expect(bookAfter.availableCopies).toBe(2);
    expect(await Book.countDocuments()).toBe(1);
    expect((await ResearchPaper.findById(paper._id)).status).toBe("pending");
    expect(await StudentAuthentication.countDocuments()).toBe(1);
    expect(await Admin.countDocuments()).toBe(0);
  });

  test("searches that use POST still work for guests", async () => {
    const agent = await adminGuest();
    await createRosterEntry();

    const roster = await agent.post("/api/main/student/search").send({ query: "Tajwarul" });
    const lookup = await agent.post("/api/admin/access/students/search").send({ regNo: "missing" });

    expect(roster.status).toBe(200);
    expect(lookup.status).toBe(404); // reached the handler (not 403)
  });

  test("guest can log out", async () => {
    const agent = await adminGuest();

    const res = await agent.post("/api/admin/logout");

    expect(res.status).toBe(200);
  });
});

describe("Guest mode: student portal", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  test("guest login creates no database records and /me reports a guest", async () => {
    const agent = await studentGuest();

    const me = await agent.get("/api/user/me");

    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe("guest");
    expect(await User.countDocuments()).toBe(0);
  });

  test("guest can browse books and research papers", async () => {
    const agent = await studentGuest();
    await addBook();
    await addPaper({ status: "approved" });

    const books = await agent.get("/api/student/access/books");
    const papers = await agent.get("/api/student/access/research-papers");

    expect(books.status).toBe(200);
    expect(books.body.data).toHaveLength(1);
    expect(papers.body.papers).toHaveLength(1);
  });

  test("guest's own lists are empty (never someone else's data)", async () => {
    const agent = await studentGuest();
    await addPaper({ status: "approved" }); // admin-created: no submitter

    const myPapers = await agent.get("/api/student/access/research-papers/my-papers");
    const reservations = await agent.get("/api/student/access/reservations");
    const notifications = await agent.get("/api/student/notifications");

    expect(myPapers.body.papers).toHaveLength(0);
    expect(reservations.body.data).toHaveLength(0);
    expect(notifications.body.notifications).toHaveLength(0);
  });

  test("reserving, waitlisting, submitting papers and paying are refused", async () => {
    const agent = await studentGuest();
    const book = await addBook();

    const attempts = await Promise.all([
      agent.post(`/api/student/access/books/${book._id}/reserve`),
      agent.post(`/api/student/access/books/${book._id}/waitlist`),
      agent.post("/api/student/access/research-papers").send({ title: "T", authors: [{ name: "A" }], category: "CSE", paperLink: "https://x.com" }),
      agent.post("/api/student/payment/init"),
      agent.patch("/api/student/notifications/read-all"),
    ]);

    for (const res of attempts) {
      expect({ url: res.req.path, status: res.status }).toEqual({ url: res.req.path, status: 403 });
    }
    expect((await Book.findById(book._id)).availableCopies).toBe(2);
    expect(await ReserveBook.countDocuments()).toBe(0);
    expect(await ResearchPaper.countDocuments()).toBe(0);
  });

  test("guest can log out", async () => {
    const agent = await studentGuest();

    const res = await agent.post("/api/user/logout");

    expect(res.status).toBe(200);
  });

  test("guest chatbot is limited to 5 questions per minute", async () => {
    const agent = await studentGuest();
    process.env.NODE_ENV = "development"; // rate limits are skipped under "test"

    const statuses = [];
    for (let i = 0; i < 6; i++) {
      // No threadId: the controller answers 400 without calling any AI API,
      // but every request still counts against the limit.
      const res = await agent.post("/api/student/rag/access").send({ input: "hi" });
      statuses.push(res.status);
    }

    process.env.NODE_ENV = "test";
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
  });
});

describe("Guest mode: tokens only work on their own portal", () => {
  beforeAll(connectTestDB);
  afterAll(closeTestDB);

  test("an admin-portal guest token is refused by the student portal", async () => {
    const res = await request(app).post("/api/admin/guest");
    const token = res.headers["set-cookie"][0].split(";")[0].split("=")[1];

    const me = await request(app).get("/api/user/me").set("Cookie", `student_token=${token}`);

    expect(me.status).toBe(401);
  });

  test("a student-portal guest token is refused by the admin portal", async () => {
    const res = await request(app).post("/api/user/guest");
    const token = res.headers["set-cookie"][0].split(";")[0].split("=")[1];

    const me = await request(app).get("/api/admin/me").set("Cookie", `admin_token=${token}`);

    expect(me.status).toBe(403);
  });
});

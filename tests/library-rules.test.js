import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/user-auth-models.js";
import StudentAuthentication from "../src/models/student-authentication-model.js";
import { Book } from "../src/models/book-model.js";
import { IssuedBook } from "../src/models/issuebook-model.js";
import { ReserveBook } from "../src/models/reserve-book.js";
import { Waitlist } from "../src/models/waitlist-model.js";
import { Transaction } from "../src/models/transaction-model.js";
import { fullDaysOverdue, chargeLateFine, chargeAllLateFines } from "../src/services/late-fine-service.js";
import { LATE_FINES_START_DATE, DAY_MS } from "../src/config/library.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createAdmin, createStudent, createRosterEntry, adminCookie, studentCookie } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Library rules (Phase 3)
 *
 * Purpose: late fines, safe returns, book edits, the 3-book limit, safe
 * deletes, reservation hold time and payment fail/cancel handling.
 */
const HOUR_MS = 60 * 60 * 1000;
let isbnCounter = 0;

const createBook = (overrides = {}) =>
  Book.create({
    title: `Book ${++isbnCounter}`,
    authors: ["Some Author"],
    isbn: `97801323508${String(isbnCounter).padStart(2, "0")}`,
    totalCopies: 3,
    availableCopies: 3,
    ...overrides,
  });

const createLoan = (user, book, overrides = {}) =>
  IssuedBook.create({
    book: book._id,
    bookTitle: book.title,
    bookAuthors: book.authors,
    user: user._id,
    userName: user.name,
    userRegNo: user.regNo,
    userDepartment: user.department,
    userSession: user.Session,
    ...overrides,
  });

const createReservation = (user, book, overrides = {}) =>
  ReserveBook.create({
    book: book._id,
    book_title: book.title,
    book_authors: book.authors,
    user: user._id,
    user_name: user.name,
    user_regNo: user.regNo,
    user_department: user.department,
    user_Session: user.Session,
    ...overrides,
  });

const fineOf = async (user) => (await User.findById(user._id).lean()).fine;

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe("Late fines (৳5 per full overdue day, from launch)", () => {
  test("counts only full days after the due date", () => {
    const due = new Date(LATE_FINES_START_DATE.getTime() + 10 * DAY_MS);

    expect(fullDaysOverdue(due, new Date(due.getTime() + 23 * HOUR_MS))).toBe(0);
    expect(fullDaysOverdue(due, new Date(due.getTime() + 25 * HOUR_MS))).toBe(1);
    expect(fullDaysOverdue(due, new Date(due.getTime() + 49 * HOUR_MS))).toBe(2);
  });

  test("books overdue before launch only count days from the launch date", () => {
    const dueLongBefore = new Date(LATE_FINES_START_DATE.getTime() - 30 * DAY_MS);
    const twoDaysAfterLaunch = new Date(LATE_FINES_START_DATE.getTime() + 2 * DAY_MS);

    expect(fullDaysOverdue(dueLongBefore, twoDaysAfterLaunch)).toBe(2);
  });

  test("charges each overdue day exactly once, even if called repeatedly or concurrently", async () => {
    const student = await createStudent();
    const book = await createBook();
    const loan = await createLoan(student, book, { dueDate: new Date(Date.now() - 3 * DAY_MS - HOUR_MS) });

    await Promise.all([chargeLateFine(loan), chargeLateFine(loan), chargeLateFine(loan)]);
    await chargeLateFine(await IssuedBook.findById(loan._id));

    expect(await fineOf(student)).toBe(15);
    expect((await IssuedBook.findById(loan._id)).lateFineDaysCharged).toBe(3);
  });

  test("loans created before this feature (no counter stored) are handled", async () => {
    const student = await createStudent();
    const book = await createBook();
    const loan = await createLoan(student, book, { dueDate: new Date(Date.now() - 2 * DAY_MS - HOUR_MS) });
    await IssuedBook.collection.updateOne({ _id: loan._id }, { $unset: { lateFineDaysCharged: "" } });

    await chargeAllLateFines();

    expect(await fineOf(student)).toBe(10);
  });

  test("returned books are never charged by the daily job", async () => {
    const student = await createStudent();
    const book = await createBook();
    await createLoan(student, book, {
      dueDate: new Date(Date.now() - 5 * DAY_MS),
      status: "returned",
      returnedAt: new Date(),
    });

    await chargeAllLateFines();

    expect(await fineOf(student)).toBe(0);
  });

  test("returning a late book charges any days not yet billed", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const book = await createBook({ availableCopies: 2 });
    const loan = await createLoan(student, book, { dueDate: new Date(Date.now() - 2 * DAY_MS - HOUR_MS) });

    const res = await request(app)
      .post(`/api/admin/access/issued/${loan._id}/return`)
      .set("Cookie", adminCookie(admin));

    expect(res.status).toBe(200);
    expect(res.body.lateFineCharged).toBe(10);
    expect(await fineOf(student)).toBe(10);
  });
});

describe("Returns", () => {
  test("a double-clicked Return only puts the copy back once", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const book = await createBook({ availableCopies: 2 });
    const loan = await createLoan(student, book);

    const [a, b] = await Promise.all([
      request(app).post(`/api/admin/access/issued/${loan._id}/return`).set("Cookie", adminCookie(admin)),
      request(app).post(`/api/admin/access/issued/${loan._id}/return`).set("Cookie", adminCookie(admin)),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect((await Book.findById(book._id)).availableCopies).toBe(3);
  });
});

describe("Editing a book", () => {
  test("cover image changes are saved", async () => {
    const admin = await createAdmin();
    const book = await createBook();

    const res = await request(app)
      .patch(`/api/admin/access/books/${book._id}`)
      .set("Cookie", adminCookie(admin))
      .send({ coverImage: { url: "https://example.com/cover.jpg", publicId: null } });

    expect(res.status).toBe(200);
    expect(res.body.book.coverImage.url).toBe("https://example.com/cover.jpg");
  });

  test("changing only the total adjusts available copies by the same amount", async () => {
    const admin = await createAdmin();
    const book = await createBook({ totalCopies: 3, availableCopies: 1 }); // 2 out on loan

    const res = await request(app)
      .patch(`/api/admin/access/books/${book._id}`)
      .set("Cookie", adminCookie(admin))
      .send({ totalCopies: 5 });

    expect(res.status).toBe(200);
    expect(res.body.book.totalCopies).toBe(5);
    expect(res.body.book.availableCopies).toBe(3);
  });

  test("can't reduce the total below the copies currently out", async () => {
    const admin = await createAdmin();
    const book = await createBook({ totalCopies: 3, availableCopies: 1 }); // 2 out

    const res = await request(app)
      .patch(`/api/admin/access/books/${book._id}`)
      .set("Cookie", adminCookie(admin))
      .send({ totalCopies: 1 });

    expect(res.status).toBe(400);
    expect((await Book.findById(book._id)).totalCopies).toBe(3);
  });

  test("editing just the title leaves stock alone", async () => {
    const admin = await createAdmin();
    const book = await createBook({ totalCopies: 3, availableCopies: 1 });

    await request(app)
      .patch(`/api/admin/access/books/${book._id}`)
      .set("Cookie", adminCookie(admin))
      .send({ title: "New Title" });

    const after = await Book.findById(book._id);
    expect(after.title).toBe("New Title");
    expect(after.availableCopies).toBe(1);
  });
});

describe("3-book limit counts issued books AND active reservations", () => {
  test("a student with 2 loans and 1 reservation can't reserve a 4th", async () => {
    const student = await createStudent();
    const [b1, b2, b3, b4] = await Promise.all([createBook(), createBook(), createBook(), createBook()]);
    await createLoan(student, b1);
    await createLoan(student, b2);
    await createReservation(student, b3);

    const res = await request(app)
      .post(`/api/student/access/books/${b4._id}/reserve`)
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(409);
    expect((await Book.findById(b4._id)).availableCopies).toBe(3);
  });

  test("expired reservations don't count toward the limit", async () => {
    const student = await createStudent();
    const [b1, b2, b3, b4] = await Promise.all([createBook(), createBook(), createBook(), createBook()]);
    await createLoan(student, b1);
    await createLoan(student, b2);
    await createReservation(student, b3, { expiresAt: new Date(Date.now() - 60 * 1000) });

    const res = await request(app)
      .post(`/api/student/access/books/${b4._id}/reserve`)
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(201);
  });

  test("admin direct issue also respects reservations", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const [b1, b2, b3, b4] = await Promise.all([createBook(), createBook(), createBook(), createBook()]);
    await createLoan(student, b1);
    await createReservation(student, b2);
    await createReservation(student, b3);

    const res = await request(app)
      .post(`/api/admin/access/books/${b4._id}/issue-to`)
      .set("Cookie", adminCookie(admin))
      .send({ regNo: student.regNo });

    expect(res.status).toBe(409);
  });
});

describe("Reservation hold time", () => {
  test("uses the configured hold (2 minutes) and says so", async () => {
    const student = await createStudent();
    const book = await createBook();

    const res = await request(app)
      .post(`/api/student/access/books/${book._id}/reserve`)
      .set("Cookie", studentCookie(student));

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("2 minutes");
    const holdMs = new Date(res.body.data.expiresAt) - new Date(res.body.data.reservedAt);
    expect(Math.round(holdMs / 1000)).toBe(120);
  });

  test("the student app can read the rules for its labels", async () => {
    const student = await createStudent();

    const res = await request(app).get("/api/student/access/library-config").set("Cookie", studentCookie(student));

    expect(res.body.data).toEqual({
      reservationHoldMinutes: 2,
      reservationExpiryFine: 20,
      loanDurationDays: 7,
      lateFinePerDay: 5,
      maxActiveBooks: 3,
    });
  });
});

describe("Issuing a reserved book", () => {
  test("a double-click issues it once and leaves one loan", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const book = await createBook({ availableCopies: 2 });
    const reservation = await createReservation(student, book);
    const url = `/api/admin/access/books/${book._id}/issue/${reservation._id}`;

    const [a, b] = await Promise.all([
      request(app).post(url).set("Cookie", adminCookie(admin)),
      request(app).post(url).set("Cookie", adminCookie(admin)),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await IssuedBook.countDocuments()).toBe(1);
    expect((await ReserveBook.findById(reservation._id)).status).toBe("issued");
  });
});

describe("Safe deletes", () => {
  test("a book that's out on loan can't be deleted", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const book = await createBook();
    await createLoan(student, book);

    const res = await request(app).delete(`/api/admin/access/books/${book._id}`).set("Cookie", adminCookie(admin));

    expect(res.status).toBe(409);
    expect(await Book.exists({ _id: book._id })).toBeTruthy();
  });

  test("deleting a free book also removes its waitlist entries", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const book = await createBook();
    await Waitlist.create({
      user: student._id, book: book._id, name: student.name, email: student.email,
      regNo: student.regNo, department: "CSE", Session: "2020-21", bookTitle: book.title,
    });

    const res = await request(app).delete(`/api/admin/access/books/${book._id}`).set("Cookie", adminCookie(admin));

    expect(res.status).toBe(200);
    expect(await Waitlist.countDocuments()).toBe(0);
  });

  test("a student with a book out or an unpaid fine can't be deleted", async () => {
    const admin = await createAdmin();
    const roster = await createRosterEntry();
    const student = await createStudent({ fine: 20 });

    const res = await request(app).delete(`/api/main/student/delete/${roster._id}`).set("Cookie", adminCookie(admin));

    expect(res.status).toBe(409);
    expect(await User.exists({ _id: student._id })).toBeTruthy();
    expect(await StudentAuthentication.exists({ _id: roster._id })).toBeTruthy();
  });

  test("deleting the same regNo twice within the hour works (used to fail)", async () => {
    const admin = await createAdmin();
    const first = await createRosterEntry();
    await request(app).delete(`/api/main/student/delete/${first._id}`).set("Cookie", adminCookie(admin));
    const second = await createRosterEntry();

    const res = await request(app).delete(`/api/main/student/delete/${second._id}`).set("Cookie", adminCookie(admin));

    expect(res.status).toBe(200);
  });
});

describe("Payment fail/cancel redirects", () => {
  const createTransaction = async (status) => {
    const student = await createStudent();
    return Transaction.create({ user: student._id, tran_id: "FINE-test-1", amount: 20, status });
  };

  test("a cancelled checkout marks the pending transaction CANCELLED", async () => {
    await createTransaction("PENDING");

    const res = await request(app).post("/api/payment/sslcommerz/cancel").type("form").send({ tran_id: "FINE-test-1" });

    expect(res.status).toBe(303);
    expect((await Transaction.findOne({ tran_id: "FINE-test-1" })).status).toBe("CANCELLED");
  });

  test("a failed checkout marks the pending transaction FAILED", async () => {
    await createTransaction("PENDING");

    await request(app).post("/api/payment/sslcommerz/fail").type("form").send({ tran_id: "FINE-test-1" });

    expect((await Transaction.findOne({ tran_id: "FINE-test-1" })).status).toBe("FAILED");
  });

  test("a (possibly forged) cancel can never undo a confirmed payment", async () => {
    await createTransaction("VALID");

    await request(app).post("/api/payment/sslcommerz/cancel").type("form").send({ tran_id: "FINE-test-1" });

    expect((await Transaction.findOne({ tran_id: "FINE-test-1" })).status).toBe("VALID");
  });

  test("the success redirect leaves confirmation to the IPN", async () => {
    await createTransaction("PENDING");

    await request(app).post("/api/payment/sslcommerz/success").type("form").send({ tran_id: "FINE-test-1" });

    expect((await Transaction.findOne({ tran_id: "FINE-test-1" })).status).toBe("PENDING");
  });
});

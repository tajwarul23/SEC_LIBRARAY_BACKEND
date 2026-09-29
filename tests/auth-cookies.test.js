import request from "supertest";
import app from "../src/app.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createAdmin, createStudent, adminCookie, studentCookie, setCookieNames } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Separate admin / student login cookies
 *
 * Purpose: Both portals share one backend, so each must use its own cookie.
 * Logging into (or out of) one portal must never affect the other.
 */
describe("Auth: separate admin and student cookies", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  test("admin login sets only the admin cookie", async () => {
    await createAdmin();

    const res = await request(app)
      .post("/api/admin/login")
      .send({ regNo: "admin01", password: "AdminPass123" });

    expect(res.status).toBe(200);
    expect(setCookieNames(res)).toEqual(["admin_token"]);
  });

  test("student password login sets only the student cookie", async () => {
    process.env.ALLOW_PASSWORD_LOGIN = "true";
    await createStudent();

    const res = await request(app)
      .post("/api/user/login")
      .send({ regNo: "2021331001", password: "StudentPass123" });

    process.env.ALLOW_PASSWORD_LOGIN = "";
    expect(res.status).toBe(200);
    expect(setCookieNames(res)).toEqual(["student_token"]);
  });

  test("an admin cookie is not accepted on student routes", async () => {
    const admin = await createAdmin();

    const res = await request(app).get("/api/user/me").set("Cookie", adminCookie(admin));

    expect(res.status).toBe(401);
  });

  test("a student cookie is not accepted on admin routes", async () => {
    const student = await createStudent();

    const res = await request(app).get("/api/admin/me").set("Cookie", studentCookie(student));

    expect(res.status).toBe(401);
  });

  test("both portals stay logged in side by side in one browser", async () => {
    const admin = await createAdmin();
    const student = await createStudent();
    const bothCookies = [adminCookie(admin), studentCookie(student)].join("; ");

    const adminMe = await request(app).get("/api/admin/me").set("Cookie", bothCookies);
    const studentMe = await request(app).get("/api/user/me").set("Cookie", bothCookies);

    expect(adminMe.status).toBe(200);
    expect(studentMe.status).toBe(200);
  });

  test("admin logout clears only the admin cookie", async () => {
    const admin = await createAdmin();
    const student = await createStudent();

    const res = await request(app)
      .post("/api/admin/logout")
      .set("Cookie", [adminCookie(admin), studentCookie(student)].join("; "));

    expect(res.status).toBe(200);
    expect(setCookieNames(res)).toEqual(["admin_token"]);
  });

  test("student logout clears only the student cookie", async () => {
    const admin = await createAdmin();
    const student = await createStudent();

    const res = await request(app)
      .post("/api/user/logout")
      .set("Cookie", [adminCookie(admin), studentCookie(student)].join("; "));

    expect(res.status).toBe(200);
    expect(setCookieNames(res)).toEqual(["student_token"]);
  });
});

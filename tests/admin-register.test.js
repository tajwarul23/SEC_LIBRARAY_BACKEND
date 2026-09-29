import request from "supertest";
import app from "../src/app.js";
import Admin from "../src/models/admin-model.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createAdmin, createStudent, adminCookie, studentCookie } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Admin registration is admin-only
 *
 * Purpose: Previously anyone could POST /api/admin/register and become an
 * admin. Now only a logged-in admin can create another admin.
 */
describe("Auth: admin registration", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  const newAdmin = {
    name: "Second Admin",
    email: "second@test.com",
    regNo: "admin02",
    password: "SecondPass123",
  };

  test("rejects registration with no login at all", async () => {
    const res = await request(app).post("/api/admin/register").send(newAdmin);

    expect(res.status).toBe(401);
    expect(await Admin.countDocuments()).toBe(0);
  });

  test("rejects registration from a logged-in student", async () => {
    const student = await createStudent();

    const res = await request(app)
      .post("/api/admin/register")
      .set("Cookie", studentCookie(student))
      .send(newAdmin);

    expect(res.status).toBe(401);
    expect(await Admin.countDocuments()).toBe(0);
  });

  test("a logged-in admin can create another admin, who can then log in", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/admin/register")
      .set("Cookie", adminCookie(admin))
      .send(newAdmin);

    expect(res.status).toBe(201);

    const login = await request(app)
      .post("/api/admin/login")
      .send({ regNo: "admin02", password: "SecondPass123" });
    expect(login.status).toBe(200);
  });
});

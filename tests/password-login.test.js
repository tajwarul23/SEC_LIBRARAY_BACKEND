import request from "supertest";
import app from "../src/app.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createStudent, studentCookie } from "./helpers/auth.js";

/**
 * Beginner-Friendly Test: Local-only password login
 *
 * Purpose: Students sign in with Google. The regNo + password routes are a
 * local-development fallback: off unless ALLOW_PASSWORD_LOGIN=true, and
 * always off in production.
 */
describe("Auth: password login gate", () => {
  beforeAll(connectTestDB);
  afterEach(async () => {
    process.env.ALLOW_PASSWORD_LOGIN = "";
    process.env.NODE_ENV = "test";
    await clearTestDB();
  });
  afterAll(closeTestDB);

  const login = { regNo: "2021331001", password: "StudentPass123" };

  test("password routes answer 404 when the flag is not set", async () => {
    await createStudent();

    const loginRes = await request(app).post("/api/user/login").send(login);
    const registerRes = await request(app).post("/api/user/register").send({});
    const changeRes = await request(app).post("/api/user/change-password").send({});

    expect(loginRes.status).toBe(404);
    expect(registerRes.status).toBe(404);
    expect(changeRes.status).toBe(404);
  });

  test("password routes stay off in production even with the flag set", async () => {
    await createStudent();
    process.env.ALLOW_PASSWORD_LOGIN = "true";
    process.env.NODE_ENV = "production";

    const res = await request(app).post("/api/user/login").send(login);

    expect(res.status).toBe(404);
  });

  test("password login works locally when the flag is set", async () => {
    await createStudent();
    process.env.ALLOW_PASSWORD_LOGIN = "true";

    const res = await request(app).post("/api/user/login").send(login);

    expect(res.status).toBe(200);
  });

  test("a Google-only account gets 'invalid password' instead of a server error", async () => {
    await createStudent({ password: null });
    process.env.ALLOW_PASSWORD_LOGIN = "true";

    const res = await request(app).post("/api/user/login").send(login);

    expect(res.status).toBe(401);
  });
});

describe("Auth: change-password", () => {
  beforeAll(connectTestDB);
  beforeEach(() => {
    process.env.ALLOW_PASSWORD_LOGIN = "true";
  });
  afterEach(async () => {
    process.env.ALLOW_PASSWORD_LOGIN = "";
    await clearTestDB();
  });
  afterAll(closeTestDB);

  test("requires the current password", async () => {
    const student = await createStudent();

    const res = await request(app)
      .post("/api/user/change-password")
      .set("Cookie", studentCookie(student))
      .send({ newPassword: "BrandNewPass123" });

    expect(res.status).toBe(400);
  });

  test("rejects a wrong current password", async () => {
    const student = await createStudent();

    const res = await request(app)
      .post("/api/user/change-password")
      .set("Cookie", studentCookie(student))
      .send({ currentPassword: "WrongPass123", newPassword: "BrandNewPass123" });

    expect(res.status).toBe(401);
  });

  test("changes the password when the current one is right", async () => {
    const student = await createStudent();

    const res = await request(app)
      .post("/api/user/change-password")
      .set("Cookie", studentCookie(student))
      .send({ currentPassword: "StudentPass123", newPassword: "BrandNewPass123" });
    expect(res.status).toBe(200);

    const relogin = await request(app)
      .post("/api/user/login")
      .send({ regNo: "2021331001", password: "BrandNewPass123" });
    expect(relogin.status).toBe(200);
  });

  test("a Google-only account gets a clear 400 instead of a server error", async () => {
    const student = await createStudent({ password: null });

    const res = await request(app)
      .post("/api/user/change-password")
      .set("Cookie", studentCookie(student))
      .send({ currentPassword: "Anything123", newPassword: "BrandNewPass123" });

    expect(res.status).toBe(400);
  });
});

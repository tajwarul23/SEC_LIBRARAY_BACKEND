import request from "supertest";
import app from "../src/app.js";
import { connectTestDB, clearTestDB, closeTestDB } from "./helpers/db.js";
import { createRosterEntry } from "./helpers/auth.js";
import { maskName } from "../src/services/google-auth-service.js";

/**
 * Beginner-Friendly Test: check-regno doesn't leak the student roster
 *
 * Purpose: This login step is public, and regNos are sequential. It should
 * only confirm the record exists (masked name) and whether it's linked yet.
 */
describe("Auth: check-regno", () => {
  beforeAll(connectTestDB);
  afterEach(clearTestDB);
  afterAll(closeTestDB);

  test("masks each word of a name", () => {
    expect(maskName("Tajwarul Chowdhury")).toBe("T******* C********");
    expect(maskName("  Ali  ")).toBe("A**");
  });

  test("returns only regNo, masked name and claimed flag", async () => {
    await createRosterEntry();

    const res = await request(app).post("/api/user/check-regno").send({ regNo: "2021331001" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      regNo: "2021331001",
      name: "T******* C********",
      claimed: false,
    });
  });

  test("reports an already-linked regNo as claimed", async () => {
    await createRosterEntry({ firebaseUid: "firebase-uid-123" });

    const res = await request(app).post("/api/user/check-regno").send({ regNo: "2021331001" });

    expect(res.body.data.claimed).toBe(true);
  });

  test("answers 404 for an unknown regNo", async () => {
    const res = await request(app).post("/api/user/check-regno").send({ regNo: "0000000000" });

    expect(res.status).toBe(404);
  });
});

import bcrypt from "bcryptjs";
import Admin from "../../src/models/admin-model.js";
import User from "../../src/models/user-auth-models.js";
import StudentAuthentication from "../../src/models/student-authentication-model.js";
import { signAuthToken, ADMIN_COOKIE, STUDENT_COOKIE } from "../../src/services/token-service.js";

// Low bcrypt cost keeps tests fast; production code still uses cost 12.
const hash = (password) => bcrypt.hash(password, 4);

export async function createAdmin(overrides = {}) {
  const { password = "AdminPass123", ...rest } = overrides;
  return Admin.create({
    name: "Test Admin",
    email: "admin@test.com",
    regNo: "admin01",
    password: await hash(password),
    role: "admin",
    ...rest,
  });
}

// password: null creates a Google-only account (no password set)
export async function createStudent(overrides = {}) {
  const { password = "StudentPass123", ...rest } = overrides;
  return User.create({
    name: "Test Student",
    regNo: "2021331001",
    email: "student@test.com",
    gender: "Male",
    department: "CSE",
    Session: "2020-21",
    role: "user",
    ...(password ? { password: await hash(password) } : {}),
    ...rest,
  });
}

export async function createRosterEntry(overrides = {}) {
  return StudentAuthentication.create({
    name: "Tajwarul Chowdhury",
    gmail: "student@test.com",
    regNo: "2021331001",
    gender: "Male",
    Session: "2020-21",
    department: "CSE",
    ...overrides,
  });
}

// Cookie header values, for requests that need an already-logged-in user
export const adminCookie = (admin) => `${ADMIN_COOKIE}=${signAuthToken(admin)}`;
export const studentCookie = (user) => `${STUDENT_COOKIE}=${signAuthToken(user)}`;

// Names of cookies a response sets, e.g. ["admin_token"]
export const setCookieNames = (res) =>
  (res.headers["set-cookie"] || []).map((c) => c.split("=")[0]);

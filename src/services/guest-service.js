import crypto from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Guest mode: a one-click, read-only visit to either portal.
 *
 * No database record is created. A guest is just a short-lived JWT with
 * role "guest", the portal it belongs to, and a random guestId (used only
 * to keep each guest's chatbot memory and rate limit separate).
 */
export const GUEST_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function signGuestToken(portal) {
  return jwt.sign(
    { role: "guest", portal, guestId: crypto.randomUUID() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "2h" }
  );
}

export function isGuestPayload(payload, portal) {
  return payload?.role === "guest" && payload?.portal === portal;
}

// Shapes match publicAdmin() / publicUser(), so /me works unchanged.
export function guestAdminProfile() {
  return { _id: null, name: "Guest", email: null, regNo: "guest", role: "guest" };
}

export function guestStudentProfile(guestId) {
  return {
    _id: null,
    id: null,
    guestId,
    isGuest: true,
    name: "Guest",
    regNo: null,
    email: null,
    department: null,
    Session: null,
    gender: null,
    role: "guest",
    fine: 0,
  };
}

// Guests may only read. These are the only non-GET requests they can make:
// logging out, searches that happen to use POST, and asking the chatbot
// (which doesn't write to the database).
const GUEST_ALLOWED_WRITES = {
  admin: new Set([
    "POST /api/admin/logout",
    "POST /api/admin/access/students/search",
    "POST /api/main/student/search",
  ]),
  student: new Set([
    "POST /api/user/logout",
    "POST /api/student/rag/access",
  ]),
};

export function isGuestRequestAllowed(req, portal) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  return GUEST_ALLOWED_WRITES[portal].has(`${req.method} ${req.baseUrl}${req.path}`);
}

export const GUEST_READ_ONLY_MESSAGE = "Guest mode is read-only. Sign in to make changes.";

import jwt from "jsonwebtoken";

// Separate cookies per portal: both portals talk to the same backend domain,
// so a shared cookie name meant logging into one portal logged the other out.
export const ADMIN_COOKIE = "admin_token";
export const STUDENT_COOKIE = "student_token";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function signAuthToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "24h" }
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // SameSite=None requires Secure — browsers silently drop the cookie
    // otherwise. Production frontend/backend live on different domains
    // (cross-site, needs None+Secure over HTTPS); local dev is different
    // ports on localhost (same-site), so Lax works over plain HTTP.
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
}

export function setAuthCookie(res, token, cookieName, maxAge = SESSION_TTL_MS) {
  res.cookie(cookieName, token, { ...cookieOptions(), maxAge });
}

export function clearAuthCookie(res, cookieName) {
  res.clearCookie(cookieName, cookieOptions());
}

export function getAuthTokenFromCookie(req, cookieName) {
  if (cookieName && req.cookies?.[cookieName]) {
    return req.cookies[cookieName];
  }
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

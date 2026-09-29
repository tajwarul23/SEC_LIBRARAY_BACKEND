import { verifyAuthToken, getAuthTokenFromCookie, ADMIN_COOKIE } from "../services/token-service.js";
import Admin from "../models/admin-model.js";

/**
 * Middleware: Verify Admin Authentication & Role
 */
export function authenticateAdmin(req, res, next) {
  // Step 1: Extract JWT token
  const token = getAuthTokenFromCookie(req, ADMIN_COOKIE);
  if (!token) {
    return res.status(401).json({ success: false, message: "Admin authentication required" });
  }

  try {
    // Step 2: Verify token and check for 'admin' role
    const payload = verifyAuthToken(token);
    if (payload.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (error) {
    console.error("authenticateAdmin: token verification failed", error?.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export async function loadAdmin(req, res, next) {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(401).json({ success: false, message: "Admin account no longer exists" });
    }

    req.admin = admin;
    return next();
  } catch (error) {
    console.error("loadAdmin: failed to load admin", error);
    return res.status(500).json({ success: false, message: "Authentication error" });
  }
}

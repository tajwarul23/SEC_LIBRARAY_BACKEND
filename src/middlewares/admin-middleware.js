import { verifyAuthToken, getAuthTokenFromCookie, ADMIN_COOKIE } from "../services/token-service.js";
import {
  isGuestPayload,
  isGuestRequestAllowed,
  guestAdminProfile,
  GUEST_READ_ONLY_MESSAGE,
} from "../services/guest-service.js";
import Admin from "../models/admin-model.js";

/**
 * Middleware: Verify Admin Authentication & Role
 *
 * Admin-portal guests pass too, but only for read-only requests.
 */
export function authenticateAdmin(req, res, next) {
  // Step 1: Extract JWT token
  const token = getAuthTokenFromCookie(req, ADMIN_COOKIE);
  if (!token) {
    return res.status(401).json({ success: false, message: "Admin authentication required" });
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch (error) {
    console.error("authenticateAdmin: token verification failed", error?.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  // Step 2: Guests may browse the admin portal but never change anything
  if (isGuestPayload(payload, "admin")) {
    if (!isGuestRequestAllowed(req, "admin")) {
      return res.status(403).json({ success: false, message: GUEST_READ_ONLY_MESSAGE });
    }
    req.user = { id: null, role: "guest", isGuest: true, isAdminGuest: true, guestId: payload.guestId };
    return next();
  }

  // Step 3: Otherwise the token must belong to an admin
  if (payload.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }

  req.user = { id: payload.id, role: payload.role };
  next();
}

export async function loadAdmin(req, res, next) {
  if (req.user?.isAdminGuest) {
    req.admin = guestAdminProfile();
    return next();
  }

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

import { setAuthCookie, ADMIN_COOKIE, STUDENT_COOKIE } from "../services/token-service.js";
import {
  signGuestToken,
  GUEST_TTL_MS,
  guestAdminProfile,
  guestStudentProfile,
} from "../services/guest-service.js";
import { publicUser } from "../utils/public-user.js";

// POST /api/admin/guest — one-click read-only visit to the admin portal
export const adminGuestLogin = (req, res) => {
  setAuthCookie(res, signGuestToken("admin"), ADMIN_COOKIE, GUEST_TTL_MS);
  return res.status(200).json({
    success: true,
    message: "Signed in as guest (read-only)",
    data: { admin: guestAdminProfile() },
  });
};

// POST /api/user/guest — one-click read-only visit to the student portal
export const studentGuestLogin = (req, res) => {
  setAuthCookie(res, signGuestToken("student"), STUDENT_COOKIE, GUEST_TTL_MS);
  return res.status(200).json({
    success: true,
    message: "Signed in as guest (read-only)",
    data: { user: publicUser(guestStudentProfile()) },
  });
};

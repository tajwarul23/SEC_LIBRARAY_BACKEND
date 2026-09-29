import { verifyAuthToken, getAuthTokenFromCookie, STUDENT_COOKIE } from "../services/token-service.js";
import User from "../models/user-auth-models.js";
import TemporaryRegNo from "../models/TemporaryRegNo.js";

/**
 * Middleware: Authenticate Student / User
 * 
 * Flow:
 * 1. Extracts JWT token from cookie or Authorization header.
 * 2. Verifies token authenticity using JWT_ACCESS_SECRET.
 * 3. Checks if user exists in the database.
 * 4. Checks if registration number is blocked in TemporaryRegNo.
 * 5. Attaches user profile object to req.user for downstream controllers.
 */
export async function authenticate(req, res, next) {
  // Step 1: Extract JWT token
  const token = getAuthTokenFromCookie(req, STUDENT_COOKIE);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  // Step 2: Verify token signature
  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(payload.id)
      .select("name regNo email phone department Session role fine")
      .lean();

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const tempRegNo = await TemporaryRegNo.findOne({ regNo: user.regNo });
    if (tempRegNo) {
      return res.status(401).json({
        success: false,
        message: "you are blocked..you are not allowed to acsess the system",
      });
    }

    req.user = {
      _id: user._id,
      id: user._id,
      name: user.name,
      regNo: user.regNo,
      email: user.email,
      phone: user.phone,
      department: user.department,
      Session: user.Session,
      role: user.role || "user",
      fine: user.fine ?? 0,
    };

    return next();
  } catch (error) {
    console.error("authenticate: failed to load user", error);
    return res.status(500).json({ success: false, message: "Authentication error" });
  }
}
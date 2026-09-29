import { Router } from "express";
import {
  register,
  login,
  logout,
  me,
  changePassword,
} from "../controllers/user-register-controller.js";
import { checkRegNo, googleAuth } from "../controllers/google-auth-controller.js";
import { authenticate } from "../middlewares/auth-middleware.js";
import { authRateLimiter, guestLoginRateLimiter } from "../middlewares/rate-limiter.js";
import { studentGuestLogin } from "../controllers/guest-controller.js";
import { requirePasswordLogin } from "../middlewares/password-login-middleware.js";

const router = Router();

// Local-development password fallback (404 in production / when disabled)
router.post("/register", requirePasswordLogin, authRateLimiter, register);
router.post("/login", requirePasswordLogin, authRateLimiter, login);
router.post("/change-password", requirePasswordLogin, authRateLimiter, authenticate, changePassword);

router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);
router.post("/check-regno", authRateLimiter, checkRegNo);
router.post("/google-auth", authRateLimiter, googleAuth);
router.post("/guest", guestLoginRateLimiter, studentGuestLogin);

export default router;

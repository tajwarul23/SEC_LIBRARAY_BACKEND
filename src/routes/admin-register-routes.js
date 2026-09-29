import { Router } from "express";
import {
  registerAdminHandler,
  loginAdminHandler,
  logoutAdminHandler,
  me,
} from "../controllers/admin-register-controller.js";
import { authenticateAdmin, loadAdmin } from "../middlewares/admin-middleware.js";
import { adminAuthRateLimiter } from "../middlewares/rate-limiter.js";

const router = Router();

// Only an existing, logged-in admin can create another admin.
// The very first admin is created with `npm run seed:admin`.
router.post("/register", authenticateAdmin, loadAdmin, registerAdminHandler);
router.post("/login", adminAuthRateLimiter, loginAdminHandler);
router.post("/logout", authenticateAdmin, logoutAdminHandler);
router.get("/me", authenticateAdmin, loadAdmin, me);

export default router;

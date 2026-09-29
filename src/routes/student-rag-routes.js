import express from "express";
import { authenticate } from "../middlewares/auth-middleware.js";
import { ragRateLimiter, guestRagRateLimiter } from "../middlewares/rate-limiter.js";
import { getSmartSearchResults } from "../controllers/student-rag-controller.js";

const router = express.Router();

router.use(authenticate);
router.use(ragRateLimiter);
router.use(guestRagRateLimiter);

// Student RAG access route
router.post("/access", getSmartSearchResults);

export default router;
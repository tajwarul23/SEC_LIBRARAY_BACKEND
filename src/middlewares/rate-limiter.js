import rateLimit from "express-rate-limit";

// Rate limits are per-process in-memory counters keyed by IP; tests fire many
// requests from one IP, so limits are switched off under NODE_ENV=test.
const skipInTests = () => process.env.NODE_ENV === "test";

export const authRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  limit: 5, // max 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many authentication requests. Please try again later.",
  },
});

export const adminAuthRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  limit: 5, // max 5 admin login attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

export const ragRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  limit: 15, // max 15 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many smart search requests. Please wait a moment and try again.",
  },
});

export const studentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 100, // max 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many student requests. Please try again later.",
  },
});

// Public SSLCommerz IPN/redirect endpoints — no auth, so bound request volume
// to avoid unbounded calls out to SSLCommerz's validation API.
export const paymentPublicRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many payment requests. Please try again shortly.",
  },
});
// One-click guest logins create no DB records, but cap them per IP anyway.
export const guestLoginRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many guest sign-ins. Please try again shortly.",
  },
});

// Guests share the chatbot's API quota with real students, so each guest
// session gets a tighter chatbot limit (keyed by its random guestId).
export const guestRagRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInTests() || !req.user?.isGuest,
  keyGenerator: (req) => `guest:${req.user.guestId}`,
  message: {
    success: false,
    message: "Guests can ask 5 questions per minute. Please wait a moment.",
  },
});

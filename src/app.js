import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// Route imports
import userRegisterRoutes from "./routes/user-register-routes.js";
import adminRegisterRoutes from "./routes/admin-register-routes.js";
import adminAccessRoutes from "./routes/admin-access-route.js";
import studentAuthenticationRoutes from "./routes/student-authenticaton-route.js";
import userBookAccessRoutes from "./routes/user-book-access-route.js";
import notificationRoutes from "./routes/notification-routes.js";
import studentRagRoutes from "./routes/student-rag-routes.js";
import paymentRoutes from "./routes/payment-routes.js";
import studentPaymentRoutes from "./routes/student-payment-routes.js";

const app = express();

// ==========================================
// 1. Security & Header Middlewares
// ==========================================
app.disable("x-powered-by");

// On Render, requests arrive through a proxy. Trusting one proxy hop makes
// req.ip the real visitor's IP, so rate limits are per visitor instead of
// one shared bucket for everyone. Off locally (no proxy; X-Forwarded-For
// would be client-controlled). Override with TRUST_PROXY if the hop count differs.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "0");
app.set("trust proxy", Number(trustProxy));
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

// ==========================================
// 2. CORS Configuration
// ==========================================
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.STUDENT_CLIENT_URL,
].filter(Boolean);

app.use(
  cors((req, callback) => {
    // SSLCommerz's IPN/success/fail/cancel callbacks come from SSLCommerz's own
    // servers and the customer's browser mid-redirect, with an Origin header
    // that will never be in allowedOrigins — and they don't use cookies, so the
    // origin allowlist doesn't apply to them at all.
    if (req.path.startsWith("/api/payment/")) {
      return callback(null, { origin: true, credentials: false });
    }

    // Allow requests with a matching origin or no origin (e.g. mobile/curl).
    // A non-matching origin gets no CORS headers (browser blocks reading the
    // response) rather than a thrown error, so a stray/unexpected Origin
    // header can't crash the request with a 500.
    const origin = req.header("Origin");
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, { origin: true, credentials: true });
    }
    return callback(null, { origin: false });
  })
);

// ==========================================
// 3. Body Parsers & Cookie Parser
// ==========================================
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// ==========================================
// 4. System Health Check
// ==========================================
app.get("/health", (req, res) => {
  res.send("<h1>API is healthy</h1>");
});

// ==========================================
// 5. Application API Routes
// ==========================================
app.use("/api/user", userRegisterRoutes);
app.use("/api/admin", adminRegisterRoutes);
app.use("/api/admin/access", adminAccessRoutes);
app.use("/api/main/student", studentAuthenticationRoutes);
app.use("/api/student/access", userBookAccessRoutes);
app.use("/api/student/rag", studentRagRoutes);
app.use("/api/student", notificationRoutes);
app.use("/api/student/payment", studentPaymentRoutes);
app.use("/api/payment", paymentRoutes);

// ==========================================
// 6. 404 Catch-all Fallback Handler
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;
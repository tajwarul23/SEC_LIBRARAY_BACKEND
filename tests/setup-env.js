/**
 * Runs before every test file (see jest.config.js → setupFiles).
 *
 * dotenv never overrides variables that are already set, so pinning them
 * here guarantees tests can't pick up the real .env values — no real
 * Atlas database, Qdrant, Gemini, Groq or SSLCommerz calls from tests.
 */
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-jwt-secret";
process.env.MONGO_URI = "mongodb://127.0.0.1:1/unused-in-tests";
process.env.CLIENT_URL = "http://admin.test";
process.env.STUDENT_CLIENT_URL = "http://student.test";
process.env.BACKEND_URL = "http://backend.test";

process.env.QDRANT_URL_RAG = "";
process.env.QDRANT_API_KEY_RAG = "";
process.env.GOOGLE_API_KEY = "";
process.env.GROQ_API_KEY_RAG = "";
process.env.GROQ_API_KEY = "";

process.env.SSLCOMMERZ_STORE_ID = "test-store";
process.env.SSLCOMMERZ_STORE_PASSWORD = "test-store-password";
process.env.SSLCOMMERZ_IS_LIVE = "false";

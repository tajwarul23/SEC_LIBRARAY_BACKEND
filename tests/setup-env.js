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
// Off by default; individual tests switch it on. Empty (not deleted) so a
// later dotenv.config() can never load the real .env value into tests.
process.env.ALLOW_PASSWORD_LOGIN = "";

process.env.QDRANT_URL_RAG = "";
process.env.QDRANT_API_KEY_RAG = "";
process.env.GOOGLE_API_KEY = "";
process.env.GROQ_API_KEY_RAG = "";
process.env.GROQ_API_KEY = "";

// Late fines "launched" long ago, so test results don't depend on the date
// the tests run (the real default is the launch day).
process.env.LATE_FINES_START_DATE = "2000-01-01T00:00:00Z";

process.env.SSLCOMMERZ_STORE_ID = "test-store";
process.env.SSLCOMMERZ_STORE_PASSWORD = "test-store-password";
process.env.SSLCOMMERZ_IS_LIVE = "false";

export default {
  // Use node environment for backend testing
  testEnvironment: "node",

  // Enable native ES Modules
  transform: {},

  // Path pattern to look for test files
  testMatch: ["**/tests/**/*.test.js"],

  // Pin env vars before any test file loads, so tests never read the real .env
  setupFiles: ["<rootDir>/tests/setup-env.js"],

  // First run downloads the in-memory MongoDB binary, which can take a while
  testTimeout: 60000,

  // Automatically clear mock calls between tests
  clearMocks: true,

  // Verbose output for beginner-friendly test logs
  verbose: true,

  // Mock third-party libraries that have CJS/ESM compatibility quirks
  moduleNameMapper: {
    "^firebase-admin/(.*)$": "<rootDir>/tests/mocks/firebase-admin.js",
    "^firebase-admin$": "<rootDir>/tests/mocks/firebase-admin.js",
  },
};

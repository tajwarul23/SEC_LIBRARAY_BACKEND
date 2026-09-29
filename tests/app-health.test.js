import "dotenv/config";
import request from "supertest";
import app from "../src/app.js";

/**
 * Beginner-Friendly Test: Express App Routes
 * 
 * Purpose: Test health check endpoint and 404 handler using Supertest.
 */
describe("API Routes: Health & 404", () => {
  test("GET /health should return 200 and health message", async () => {
    // 1. Send HTTP GET request to /health
    const response = await request(app).get("/health");

    // 2. Assert HTTP status and response
    expect(response.status).toBe(200);
    expect(response.text).toContain("API is healthy");
  });

  test("GET /api/non-existing-route should return 404 Route Not Found", async () => {
    // 1. Send request to unknown endpoint
    const response = await request(app).get("/api/unknown-random-route");

    // 2. Assert 404 Not Found
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Route not found",
    });
  });
});

describe("App config: proxy trust", () => {
  test("does not trust X-Forwarded-For outside production (no proxy locally)", () => {
    expect(app.get("trust proxy")).toBe(0);
  });
});

import { jest } from "@jest/globals";

/**
 * Beginner-Friendly Test: Chatbot memory is per student
 *
 * Purpose: Chat history used to be stored only under the browser's threadId,
 * so the same threadId from a different student continued someone else's
 * conversation. Now the memory key always includes the logged-in user.
 */
const askLibraryAssistant = jest.fn(async () => ({ type: "conversation", message: "Hi!" }));

jest.unstable_mockModule("../src/services/student-rag-service.js", () => ({
  askLibraryAssistant,
  indexRagDocuments: jest.fn(),
  isRagConfigured: () => true,
}));

const { getSmartSearchResults } = await import("../src/controllers/student-rag-controller.js");

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
}

describe("Controller: chatbot thread scoping", () => {
  test("memory key combines the student id and the threadId", async () => {
    const req = { body: { input: "books on sorting", threadId: "thread-abc" }, user: { id: "studentA" } };
    const res = mockRes();

    await getSmartSearchResults(req, res);

    expect(res.statusCode).toBe(200);
    expect(askLibraryAssistant).toHaveBeenCalledWith("books on sorting", "studentA:thread-abc");
  });

  test("the same threadId from another student gets a different memory key", async () => {
    const res = mockRes();

    await getSmartSearchResults(
      { body: { input: "hello", threadId: "thread-abc" }, user: { id: "studentB" } },
      res
    );

    expect(askLibraryAssistant).toHaveBeenLastCalledWith("hello", "studentB:thread-abc");
  });

  test("a missing threadId is rejected cleanly instead of crashing", async () => {
    const res = mockRes();

    await getSmartSearchResults({ body: { input: "hello" }, user: { id: "studentA" } }, res);

    expect(res.statusCode).toBe(400);
  });

  test("errors don't leak internal details (like raw AI output) to the student", async () => {
    askLibraryAssistant.mockRejectedValueOnce(new Error("AI returned invalid JSON: {secret internals"));
    const res = mockRes();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await getSmartSearchResults(
      { body: { input: "hello", threadId: "t1" }, user: { id: "studentA" } },
      res
    );

    errorSpy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret internals");
  });
});

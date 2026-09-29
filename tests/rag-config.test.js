import { jest } from "@jest/globals";
import { isRagConfigured, indexRagDocuments } from "../src/services/student-rag-service.js";
import { getSmartSearchResults } from "../src/controllers/student-rag-controller.js";

/**
 * Beginner-Friendly Test: Chatbot without keys
 *
 * Purpose: When the Qdrant / Google / Groq keys aren't set (as in these
 * tests), indexing must skip without calling any API, and the chat
 * endpoint must answer 503 instead of failing mid-request.
 */
describe("RAG: behaviour when not configured", () => {
  test("reports not configured when keys are missing", () => {
    expect(isRagConfigured()).toBe(false);
  });

  test("indexing skips without any network call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await indexRagDocuments(true);

    expect(result).toMatchObject({ success: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    logSpy.mockRestore();
  });

  test("the chat endpoint answers 503 with a friendly message", async () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => ((res.statusCode = code), res);
    res.json = (data) => ((res.body = data), res);

    await getSmartSearchResults(
      { body: { input: "books on sorting", threadId: "t1" }, user: { id: "student1" } },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/isn't available/);
  });
});

describe("RAG: chunking rag.text", () => {
  const sample = [
    "==========",
    "COMPUTER SCIENCE & ENGINEERING (CSE)",
    "==========",
    "------------------------------",
    "01. Data Structures & Algorithms",
    "Book: Introduction to Algorithms (CLRS)",
    "Author(s): Thomas H. Cormen",
    "------------------------------",
    "Index Concept",
    "01    Sorting",
    ...Array.from({ length: 40 }, (_, i) => `${String(i + 2).padStart(2, "0")}    Filler topic number ${i + 2} with some extra words`),
    "42    Graph Algorithms — BFS, DFS",
    "",
    "------------------------------",
    "02. Operating Systems",
    "Book: Operating System Concepts",
    "Author(s): Silberschatz",
    "------------------------------",
    "Index Concept",
    "01    Processes",
    "",
    ">>> Computer Science & Engineering (CSE) — MASTER BOOK LIST",
    "01  Algorithms    Introduction to Algorithms    Cormen",
  ].join("\r\n");

  test("each book is one chunk that keeps its title, even when long", async () => {
    const { chunkRagText } = await import("../src/services/student-rag-service.js");

    const docs = await chunkRagText(sample);
    const books = docs.filter((d) => d.metadata.kind === "book");

    expect(books.map((d) => d.metadata.book)).toEqual([
      "Introduction to Algorithms (CLRS)",
      "Operating System Concepts",
    ]);
    // The late topic stays in the same chunk as the title (this used to be split off)
    expect(books[0].pageContent).toContain("Book: Introduction to Algorithms");
    expect(books[0].pageContent).toContain("Graph Algorithms");
    expect(books[0].pageContent).not.toContain("Operating System Concepts");
    expect(books[1].pageContent).not.toContain(">>>");
  });

  test("master lists become their own chunks with their heading", async () => {
    const { chunkRagText } = await import("../src/services/student-rag-service.js");

    const docs = await chunkRagText(sample);
    const lists = docs.filter((d) => d.metadata.kind === "section" && d.pageContent.includes("MASTER BOOK LIST"));

    expect(lists).toHaveLength(1);
    expect(lists[0].pageContent).toContain("Cormen");
  });
});

/**
 * Rebuild the chatbot's search index from rag.text.
 *
 * Run after editing rag.text, or after changing the embedding model:
 *   npm run rag:index
 *
 * Deletes and recreates the Qdrant collection, so the index always matches
 * rag.text exactly. The server also indexes automatically on startup, but
 * only when the collection is empty.
 */
import "dotenv/config";
import { indexRagDocuments } from "../src/services/student-rag-service.js";

const result = await indexRagDocuments(true);
if (!result.success) {
  console.error("Indexing did not complete:", result.message || result.error);
  process.exit(1);
}
console.log(`Done: ${result.pointsCount} chunks indexed.`);

import "dotenv/config";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { startExpireReservationsCron } from "./src/cron/expireReservations.js";
import { startOverdueIssuedBooksCron } from "./src/cron/overdueIssuedBooks.js";
import { startWaitlistQueue } from "./src/queues/waitlist-queue.js";
import { indexRagDocuments } from "./src/services/student-rag-service.js";

async function bootstrap() {
  await connectDB();

  // Start in-process queue & cron jobs
  startWaitlistQueue();
  startExpireReservationsCron();
  startOverdueIssuedBooksCron();

  // Index rag.text into Qdrant in the background (skipped if already indexed).
  // Runs here rather than at app import so tests never hit Qdrant/Gemini.
  indexRagDocuments().catch((error) => {
    console.error("[RAG Service] Background indexing failed:", error?.message);
  });

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Application failed to start:", error);
  process.exit(1);
});

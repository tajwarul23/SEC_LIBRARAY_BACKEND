/**
 * Background Cron Job: Flag Overdue Issued Books
 * 
 * Flow:
 * 1. Checks for books with status 'borrowed' whose dueDate is in the past.
 * 2. Updates their status to 'overdue'.
 * 3. Adds late fines for each newly completed overdue day.
 */

import cron from "node-cron";
import { IssuedBook } from "../models/issuebook-model.js";
import { chargeAllLateFines } from "../services/late-fine-service.js";

const markOverdueIssuedBooks = async () => {
  try {
    const overdueBooks = await IssuedBook.find({
      status: "borrowed",
      dueDate: { $lte: new Date() },
    }).select("_id issuedId");

    if (overdueBooks.length > 0) {
      console.log(`[markOverdueIssuedBooks] Found ${overdueBooks.length} overdue issued book(s)`);
    }

    for (const issued of overdueBooks) {
      try {
        const updated = await IssuedBook.updateOne(
          { _id: issued._id, status: "borrowed" },
          { $set: { status: "overdue" } }
        );

        if (updated.modifiedCount > 0) {
          console.log(`[markOverdueIssuedBooks] Marked overdue: ${issued.issuedId}`);
        }
      } catch (innerError) {
        console.error(
          `[markOverdueIssuedBooks] Error processing issued book ${issued.issuedId}:`,
          innerError
        );
      }
    }
  } catch (error) {
    console.error("[markOverdueIssuedBooks] Cron job error:", error);
  }

  // Add late fines for newly completed overdue days (idempotent)
  try {
    const charged = await chargeAllLateFines();
    if (charged > 0) console.log(`[lateFines] Charged ৳${charged} in late fines`);
  } catch (error) {
    console.error("[lateFines] Cron job error:", error);
  }
};

export const startOverdueIssuedBooksCron = () => {
  cron.schedule("* * * * *", markOverdueIssuedBooks, { scheduled: true });
  console.log("[markOverdueIssuedBooks] Cron job scheduled (runs every minute)");
};

export default markOverdueIssuedBooks;
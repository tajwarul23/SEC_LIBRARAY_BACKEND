/**
 * Background Cron Job: Expire Unclaimed Book Reservations
 * 
 * Flow:
 * 1. Finds pending reservations whose expiresAt timestamp is in the past.
 * 2. Atomically marks status as 'expired'.
 * 3. Restores +1 available copy to the Book catalog.
 * 4. Adds fine to the student account.
 * 5. Notifies the next student waiting on the waitlist.
 */

import cron from "node-cron";
import { Book } from "../models/book-model.js";
import { ReserveBook } from "../models/reserve-book.js";
import User from "../models/user-auth-models.js";
import { enqueueWaitlistAvailability } from "../queues/waitlist-queue.js";

import { RESERVATION_EXPIRY_FINE } from "../config/library.js";

const expireReservations = async () => {
  try {
    const expiredReservations = await ReserveBook.find({
      status: "pending",
      expiresAt: { $lte: new Date() },
    });

    if (expiredReservations.length === 0) return;

    console.log(`[expireReservations] Found ${expiredReservations.length} expired reservation(s)`);

    for (const reservation of expiredReservations) {
      try {
        // Atomically transition status from pending to expired so it is only processed once
        const updatedReservation = await ReserveBook.findOneAndUpdate(
          { _id: reservation._id, status: "pending" },
          { $set: { status: "expired" } },
          { new: true }
        );

        if (!updatedReservation) {
          // Already issued or processed by another run
          continue;
        }

        // Increase the book's available copies by 1
        const updatedBook = await Book.findByIdAndUpdate(
          reservation.book,
          { $inc: { availableCopies: 1 } },
          { new: true }
        );

        // Apply expiry fine to user
        await User.updateOne({ _id: reservation.user }, { $inc: { fine: RESERVATION_EXPIRY_FINE } });

        // Notify next students on waitlist that a copy has become available
        if (updatedBook) {
          enqueueWaitlistAvailability(updatedBook._id, 1);
        }

        console.log(
          `[expireReservations] Expired reservation ${reservation.reservedId} for user ${reservation.user_regNo}`
        );
      } catch (innerError) {
        console.error(
          `[expireReservations] Error processing reservation ${reservation.reservedId}:`,
          innerError
        );
      }
    }
  } catch (error) {
    console.error("[expireReservations] Cron job error:", error);
  }
};

export const startExpireReservationsCron = () => {
  cron.schedule("* * * * *", expireReservations, { scheduled: true });
  console.log("[expireReservations] Cron job scheduled (runs every minute)");
};

export default expireReservations;
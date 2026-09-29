import { IssuedBook } from "../models/issuebook-model.js";
import { ReserveBook } from "../models/reserve-book.js";
import { MAX_ACTIVE_BOOKS } from "../config/library.js";

/**
 * Books a student currently holds: unreturned loans plus reservations that
 * are still holding a copy. Both count toward MAX_ACTIVE_BOOKS, otherwise a
 * student could hold every copy of a book through reservations alone.
 */
export async function countActiveBooks(userId, now = new Date()) {
  const [issued, reserved] = await Promise.all([
    IssuedBook.countDocuments({ user: userId, returnedAt: null }),
    ReserveBook.countDocuments({ user: userId, status: "pending", expiresAt: { $gt: now } }),
  ]);
  return { issued, reserved, total: issued + reserved, limit: MAX_ACTIVE_BOOKS };
}

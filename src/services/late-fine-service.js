import { IssuedBook } from "../models/issuebook-model.js";
import User from "../models/user-auth-models.js";
import { LATE_FINE_PER_DAY, LATE_FINES_START_DATE, DAY_MS } from "../config/library.js";

/**
 * Late-return fines: LATE_FINE_PER_DAY for each FULL day a book is overdue.
 *
 * Days are counted from the due date, or from LATE_FINES_START_DATE for
 * books that were already overdue before the feature launched (no
 * retroactive charges).
 */
export function fullDaysOverdue(dueDate, now = new Date()) {
  const start = dueDate > LATE_FINES_START_DATE ? dueDate : LATE_FINES_START_DATE;
  return Math.max(0, Math.floor((now.getTime() - new Date(start).getTime()) / DAY_MS));
}

/**
 * Charge any not-yet-charged overdue days for one loan. Safe to call
 * repeatedly and concurrently (cron + return at the same moment): the
 * loan's lateFineDaysCharged is advanced with a compare-and-set, and only
 * the caller that wins it adds to the fine.
 *
 * Returns the amount added (0 if nothing was due or another caller won).
 */
export async function chargeLateFine(issued, now = new Date()) {
  const days = fullDaysOverdue(issued.dueDate, now);
  const alreadyCharged = issued.lateFineDaysCharged || 0;
  if (days <= alreadyCharged) return 0;

  // Loans created before this field existed have no value stored yet
  const chargedFilter = alreadyCharged === 0 ? { $in: [0, null] } : alreadyCharged;

  const claimed = await IssuedBook.findOneAndUpdate(
    { _id: issued._id, lateFineDaysCharged: chargedFilter },
    { $set: { lateFineDaysCharged: days } },
    { new: true }
  );
  if (!claimed) return 0;

  const amount = (days - alreadyCharged) * LATE_FINE_PER_DAY;
  await User.updateOne({ _id: issued.user }, { $inc: { fine: amount } });
  return amount;
}

/**
 * Charge late fines for every unreturned overdue loan (run by the cron).
 */
export async function chargeAllLateFines(now = new Date()) {
  const overdueLoans = await IssuedBook.find({
    returnedAt: null,
    dueDate: { $lte: new Date(now.getTime() - DAY_MS) },
  }).select("_id user dueDate lateFineDaysCharged issuedId");

  let total = 0;
  for (const loan of overdueLoans) {
    try {
      total += await chargeLateFine(loan, now);
    } catch (error) {
      console.error(`[lateFines] Failed for ${loan.issuedId}:`, error?.message);
    }
  }
  return total;
}

/**
 * Library rules, in one place. Each can be overridden with an env var.
 */
const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// How long a reservation holds a copy for collection (2 minutes for demos).
export const RESERVATION_HOLD_MINUTES = numberFromEnv("RESERVATION_HOLD_MINUTES", 2);

// Fine added when a reservation expires without being collected.
export const RESERVATION_EXPIRY_FINE = numberFromEnv("RESERVATION_EXPIRY_FINE", 20);

// Loan period for an issued book.
export const LOAN_DURATION_DAYS = numberFromEnv("LOAN_DURATION_DAYS", 7);

// Late-return fine, charged for each full day a book is overdue.
export const LATE_FINE_PER_DAY = numberFromEnv("LATE_FINE_PER_DAY", 5);

// Late fines only count from this date onwards, so books that were already
// overdue before the feature launched aren't charged retroactively.
export const LATE_FINES_START_DATE = new Date(process.env.LATE_FINES_START_DATE || "2026-09-29T00:00:00Z");

// Maximum books a student can hold at once (issued + pending reservations).
export const MAX_ACTIVE_BOOKS = 3;

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

// Public subset for the student app's labels ("Reserve (2 min hold)" etc.)
export function publicLibraryConfig() {
  return {
    reservationHoldMinutes: RESERVATION_HOLD_MINUTES,
    reservationExpiryFine: RESERVATION_EXPIRY_FINE,
    loanDurationDays: LOAN_DURATION_DAYS,
    lateFinePerDay: LATE_FINE_PER_DAY,
    maxActiveBooks: MAX_ACTIVE_BOOKS,
  };
}

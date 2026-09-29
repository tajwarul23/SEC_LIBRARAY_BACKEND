import express from "express";
import {
  getBooksForStudent,
  searchBook,
  reserveBook,
  joinWaitlist,
  viewMyWaitlist,
  cancelWaitlist,
  getMyReservations,
  getMyIssuedBooks,
  getLibraryConfig,
} from "../controllers/user-book-access-controller.js";
import {
  getAllResearchPapers,
  getResearchPaperById,
  searchResearchPapers,
  submitResearchPaperByUser,
  getMyResearchPapers,
} from "../controllers/research-paper-controller.js";
import { authenticate } from "../middlewares/auth-middleware.js";
import { studentRateLimiter } from "../middlewares/rate-limiter.js";

const router = express.Router();

router.use(authenticate);
router.use(studentRateLimiter);

// Library rules (hold time, loan period, fines) for UI labels
router.get("/library-config", getLibraryConfig);

// Books
router.get("/books", getBooksForStudent);
router.get("/books/search", searchBook);

// Reservations
router.post("/books/:bookId/reserve", reserveBook);
router.get("/reservations", getMyReservations);

// Waitlist
router.post("/books/:bookId/waitlist", joinWaitlist);
router.get("/waitlist", viewMyWaitlist);
router.delete("/books/:bookId/waitlist", cancelWaitlist);

// Issued Books
router.get("/issued", getMyIssuedBooks);

// Research Papers
router.post("/research-papers", submitResearchPaperByUser);
router.post("/research-papers/create", submitResearchPaperByUser);
router.get("/research-papers/my-papers", getMyResearchPapers);
router.get("/research-papers/my-submissions", getMyResearchPapers);
router.get("/research-papers", getAllResearchPapers);
router.get("/research-papers/search", searchResearchPapers);
router.get("/research-papers/:id", getResearchPaperById);

export default router;
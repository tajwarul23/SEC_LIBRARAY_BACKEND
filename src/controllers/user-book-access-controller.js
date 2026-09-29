import mongoose from "mongoose";
import { Book } from "../models/book-model.js";
import { ReserveBook } from "../models/reserve-book.js";
import { IssuedBook } from "../models/issuebook-model.js";
import { Waitlist } from "../models/waitlist-model.js";
import User from "../models/user-auth-models.js";
import { buildBookSearchFilter } from "../utils/book-search.js";
import { MAX_PAGE_SIZE } from "../utils/pagination.js";
import { asTrimmedString } from "../utils/escape-regex.js";

// Pagination helper
const getOffsetPagination = (query) => {
  const offset = Number.parseInt(query.offset ?? "0", 10);
  const limit = Number.parseInt(query.limit ?? "3", 10);

  if (Number.isNaN(offset) || offset < 0) {
    return { error: "offset must be a non-negative number" };
  }
  if (Number.isNaN(limit) || limit <= 0) {
    return { error: "limit must be a positive number" };
  }

  return { offset, limit: Math.min(limit, MAX_PAGE_SIZE) };
};

// GET /api/student/access/books
export const getBooksForStudent = async (req, res) => {
  try {
    const { category } = req.query;
    const pagination = getOffsetPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ success: false, message: pagination.error });
    }

    const { offset, limit } = pagination;
    const filter = category ? { category } : {};

    const [totalCount, books] = await Promise.all([
      Book.countDocuments(filter),
      Book.find(filter)
        .select("title authors category totalCopies availableCopies coverImage isbn")
        .sort({ title: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: books.length > 0 ? "Books found successfully" : "No books found",
      totalCount,
      pagination: {
        offset,
        limit,
        hasNextPage: offset + books.length < totalCount,
        hasPreviousPage: offset > 0,
      },
      user: {
        name: req.user.name,
        regNo: req.user.regNo,
        department: req.user.department,
        Session: req.user.Session,
      },
      data: books,
    });
  } catch (error) {
    console.error("getBooksForStudent:", error);
    return res.status(500).json({ success: false, message: "Error in getting books for student" });
  }
};

// GET /api/student/access/books/search
export const searchBook = async (req, res) => {
  try {
    const query = asTrimmedString(req.query.query);
    if (!query) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const { filter, searchedFields } = buildBookSearchFilter(query);
    const books = await Book.find(filter)
      .select("title authors category isbn totalCopies availableCopies coverImage")
      .sort({ title: 1 })
      .limit(MAX_PAGE_SIZE)
      .lean();

    return res.status(200).json({
      success: true,
      message: books.length > 0 ? "Books found" : "No books found",
      query,
      searchedFields,
      totalCount: books.length,
      data: books,
    });
  } catch (error) {
    console.error("searchBook:", error);
    return res.status(500).json({ success: false, message: "Error in searching books" });
  }
};

// POST /api/student/access/books/:bookId/reserve
export const reserveBook = async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }

    const book = await Book.findById(bookId).lean();
    if (!book) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }

    if (book.availableCopies <= 0) {
      return res.status(409).json({
        success: false,
        message: "No available copy. You can join the waitlist.",
      });
    }

    const user = req.user;
    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Check fine
    const fineUser = await User.findById(userId).select("fine").lean();
    if (fineUser && fineUser.fine > 0) {
      return res.status(403).json({
        success: false,
        message: "You have an outstanding fine. Please clear it before reserving a book.",
        data: { fine: fineUser.fine },
      });
    }

    // Check active borrowed books count (at most 3 borrowed books allowed)
    const borrowedCount = await IssuedBook.countDocuments({
      user: userId,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (borrowedCount >= 3) {
      return res.status(409).json({
        success: false,
        message: "Borrowing limit (3) reached. You cannot reserve more books until you return current ones.",
        data: { borrowedCount },
      });
    }

    // Check already issued
    const alreadyIssued = await IssuedBook.findOne({
      user: userId,
      book: bookId,
      returnedAt: null,
    })
      .select("issuedId status borrowedAt dueDate")
      .lean();

    if (alreadyIssued) {
      return res.status(409).json({
        success: false,
        message: "You already have an unreturned copy of this book. Please return it before reserving again.",
        data: {
          issuedId: alreadyIssued.issuedId,
          status: alreadyIssued.status,
          borrowedAt: alreadyIssued.borrowedAt,
          dueDate: alreadyIssued.dueDate,
        },
      });
    }

    // Check existing active reservation
    const existingReservation = await ReserveBook.findOne({
      user: userId,
      book: bookId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (existingReservation) {
      return res.status(409).json({
        success: false,
        message: "You already have an active reservation for this book",
        data: {
          reservedId: existingReservation.reservedId,
          expiresAt: existingReservation.expiresAt,
        },
      });
    }

    // Atomically decrement availableCopies if > 0
    const updatedBook = await Book.findOneAndUpdate(
      { _id: bookId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { new: true }
    );

    if (!updatedBook) {
      return res.status(409).json({
        success: false,
        message: "No available copy. You can join the waitlist.",
      });
    }

    let reservation;
    try {
      reservation = await ReserveBook.create({
        book: updatedBook._id,
        book_title: updatedBook.title,
        book_authors: updatedBook.authors,
        user: user._id,
        user_name: user.name,
        user_regNo: user.regNo,
        user_department: user.department,
        user_Session: user.Session,
        status: "pending",
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      });
    } catch (err) {
      await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
      throw err;
    }

    return res.status(201).json({
      success: true,
      message: "Book reserved successfully for 2 hours",
      data: {
        reservedId: reservation.reservedId,
        book: { id: reservation.book, title: reservation.book_title, authors: reservation.book_authors },
        student: {
          _id: reservation.user,
          name: reservation.user_name,
          regNo: reservation.user_regNo,
          department: reservation.user_department,
          Session: reservation.user_Session,
        },
        status: reservation.status,
        reservedAt: reservation.reservedAt,
        expiresAt: reservation.expiresAt,
      },
    });
  } catch (error) {
    console.error("reserveBook:", error);
    return res.status(500).json({ success: false, message: "Failed to reserve book" });
  }
};

// POST /api/student/access/books/:bookId/waitlist
export const joinWaitlist = async (req, res) => {
  try {
    const { bookId } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }

    const book = await Book.findById(bookId).lean();
    if (!book) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }

    if (book.availableCopies > 0) {
      return res.status(409).json({
        success: false,
        message: "Book is currently available. You can reserve it instead.",
      });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Check fine
    const fineUser = await User.findById(user._id).select("fine").lean();
    if (fineUser && fineUser.fine > 0) {
      return res.status(403).json({
        success: false,
        message: "You have an outstanding fine. Please clear it before joining the waitlist.",
        data: { fine: fineUser.fine },
      });
    }

    // Check active borrowed books count (cannot join waitlist if active loans >= 3)
    const borrowedCount = await IssuedBook.countDocuments({
      user: user._id,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (borrowedCount >= 3) {
      return res.status(409).json({
        success: false,
        message: "Borrowing limit (3) reached. You cannot join the waitlist until you return current books.",
        data: { borrowedCount },
      });
    }

    // Check already issued
    const alreadyIssued = await IssuedBook.findOne({
      user: user._id,
      book: bookId,
      status: { $in: ["borrowed", "overdue"] },
    })
      .select("issuedId status borrowedAt dueDate")
      .lean();

    if (alreadyIssued) {
      return res.status(409).json({
        success: false,
        message: "You already have an active issue for this book (borrowed or overdue). Please return it before joining the waitlist.",
        data: {
          issuedId: alreadyIssued.issuedId,
          status: alreadyIssued.status,
          borrowedAt: alreadyIssued.borrowedAt,
          dueDate: alreadyIssued.dueDate,
        },
      });
    }

    // Check active reservation
    const existingReservation = await ReserveBook.findOne({
      user: user._id,
      book: bookId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .select("reservedId status reservedAt expiresAt")
      .lean();

    if (existingReservation) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending reservation for this book. Please claim or wait for it before joining the waitlist.",
        data: {
          reservedId: existingReservation.reservedId,
          status: existingReservation.status,
          reservedAt: existingReservation.reservedAt,
          expiresAt: existingReservation.expiresAt,
        },
      });
    }

    const waitlist = await Waitlist.create({
      user: user._id,
      book: book._id,
      name: user.name,
      email: user.email,
      regNo: user.regNo,
      department: user.department,
      Session: user.Session,
      bookTitle: book.title,
      bookAuthors: book.authors,
      notified: false,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Successfully joined the waitlist",
      data: {
        waitlistId: waitlist._id,
        book: { id: waitlist.book, title: waitlist.bookTitle, authors: waitlist.bookAuthors },
        student: {
          _id: waitlist.user,
          name: waitlist.name,
          email: waitlist.email,
          regNo: waitlist.regNo,
          department: waitlist.department,
          Session: waitlist.Session,
        },
        notified: waitlist.notified,
        isActive: waitlist.isActive,
        createdAt: waitlist.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You are already on the waitlist for this book",
      });
    }
    console.error("joinWaitlist:", error);
    return res.status(500).json({ success: false, message: "Failed to join the waitlist" });
  }
};

// GET /api/student/access/waitlist
export const viewMyWaitlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const pagination = getOffsetPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ success: false, message: pagination.error });
    }

    const { offset, limit } = pagination;
    const filter = { user: userId, isActive: true };

    const [totalCount, waitlists] = await Promise.all([
      Waitlist.countDocuments(filter),
      Waitlist.find(filter)
        .select("book bookTitle bookAuthors notified isActive createdAt")
        .sort({ createdAt: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: waitlists.length > 0 ? "Active waitlists found" : "No active waitlist",
      totalCount,
      pagination: {
        offset,
        limit,
        hasNextPage: offset + waitlists.length < totalCount,
        hasPreviousPage: offset > 0,
      },
      data: waitlists,
    });
  } catch (error) {
    console.error("viewMyWaitlist:", error);
    return res.status(500).json({ success: false, message: "Error in getting waitlist" });
  }
};

// DELETE /api/student/access/books/:bookId/waitlist
export const cancelWaitlist = async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }

    const deleted = await Waitlist.findOneAndDelete({
      book: bookId,
      user: userId,
      isActive: true,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Active waitlist not found" });
    }

    return res.status(200).json({ success: true, message: "Waitlist cancelled successfully" });
  } catch (error) {
    console.error("cancelWaitlist:", error);
    return res.status(500).json({ success: false, message: "Error in cancelling waitlist" });
  }
};

// GET /api/student/access/reservations
export const getMyReservations = async (req, res) => {
  try {
    const userId = req.user._id;
    const pagination = getOffsetPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ success: false, message: pagination.error });
    }

    const { offset, limit } = pagination;
    const filter = { user: userId };

    if (req.query.status) {
      const ok = ["pending", "issued", "expired"];
      if (!ok.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use pending, issued or expired.",
        });
      }
      filter.status = req.query.status;
    }

    const totalCount = await ReserveBook.countDocuments(filter);
    const rows = await ReserveBook.find(filter)
      .select("reservedId book book_title book_authors status reservedAt expiresAt")
      .sort({ reservedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const now = new Date();
    const data = rows.map((r) => ({
      reservedId: r.reservedId,
      bookTitle: r.book_title,
      bookAuthors: r.book_authors,
      bookId: r.book,
      status: r.status === "pending" && r.expiresAt <= now ? "expired" : r.status,
      reservedAt: r.reservedAt,
      expiresAt: r.expiresAt,
    }));

    return res.status(200).json({
      success: true,
      message: data.length > 0 ? "Reservations found" : "No reservations found",
      totalCount,
      offset,
      limit,
      data,
    });
  } catch (error) {
    console.error("getMyReservations:", error);
    return res.status(500).json({ success: false, message: "Error in getting reservations" });
  }
};

// GET /api/student/access/issued
export const getMyIssuedBooks = async (req, res) => {
  try {
    const userId = req.user._id;
    const pagination = getOffsetPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ success: false, message: pagination.error });
    }

    const { offset, limit } = pagination;
    const filter = { user: userId };

    if (req.query.status) {
      const ok = ["borrowed", "returned", "overdue"];
      if (!ok.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use borrowed, returned or overdue.",
        });
      }
      filter.status = req.query.status;
    }

    const totalCount = await IssuedBook.countDocuments(filter);
    const rows = await IssuedBook.find(filter)
      .select("issuedId book bookTitle bookAuthors status borrowedAt dueDate returnedAt")
      .sort({ borrowedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const now = new Date();
    const data = rows.map((b) => ({
      issuedId: b.issuedId,
      bookTitle: b.bookTitle,
      bookAuthors: b.bookAuthors,
      bookId: b.book,
      status: b.status === "borrowed" && b.dueDate <= now ? "overdue" : b.status,
      borrowedAt: b.borrowedAt,
      dueDate: b.dueDate,
      returnedAt: b.returnedAt,
    }));

    return res.status(200).json({
      success: true,
      message: data.length > 0 ? "Issued books found" : "No issued books found",
      totalCount,
      offset,
      limit,
      data,
    });
  } catch (error) {
    console.error("getMyIssuedBooks:", error);
    return res.status(500).json({ success: false, message: "Error in getting issued books" });
  }
};

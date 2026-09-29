import { Book } from "../models/book-model.js";
import User from "../models/user-auth-models.js";
import { ReserveBook } from "../models/reserve-book.js";
import { IssuedBook } from "../models/issuebook-model.js";
import { Waitlist } from "../models/waitlist-model.js";
import { chargeLateFine } from "../services/late-fine-service.js";
import { countActiveBooks } from "../services/borrow-limit-service.js";
import { enqueueWaitlistAvailability } from "../queues/waitlist-queue.js";
import { buildBookSearchFilter } from "../utils/book-search.js";
import { clampLimit, clampOffset } from "../utils/pagination.js";
import { escapeRegex, asTrimmedString } from "../utils/escape-regex.js";

const ALLOWED_CATEGORIES = [
  "CSE",
  "EEE",
  "CE",
  "PHYSICS",
  "CHEMISTRY",
  "GENERAL",
  "MATH",
  "ARTS",
  "HISTORY",
  "OTHERS",
];

// =====================================================
// BOOK MANAGEMENT
// =====================================================

// POST /api/admin/access/books
export const addBook = async (req, res) => {
  try {
    const {
      title,
      authors,
      author,
      isbn,
      totalCopies,
      availableCopies,
      category,
      coverImage,
    } = req.body;

    const authorList = Array.isArray(authors)
      ? authors.map((a) => (typeof a === "string" ? a.trim() : "")).filter(Boolean)
      : typeof author === "string" && author.trim()
        ? [author.trim()]
        : [];

    const normalizedIsbn =
      typeof isbn === "string" ? isbn.replace(/[-\s]/g, "").toUpperCase() : "";

    if (
      !title ||
      authorList.length === 0 ||
      !normalizedIsbn ||
      totalCopies === undefined ||
      availableCopies === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "title, at least one author, isbn, totalCopies and availableCopies are required",
      });
    }

    if (typeof totalCopies !== "number" || !Number.isInteger(totalCopies) || totalCopies < 0) {
      return res.status(400).json({ success: false, message: "totalCopies must be a non-negative integer" });
    }
    if (typeof availableCopies !== "number" || !Number.isInteger(availableCopies) || availableCopies < 0) {
      return res.status(400).json({ success: false, message: "availableCopies must be a non-negative integer" });
    }
    if (availableCopies > totalCopies) {
      return res.status(400).json({ success: false, message: "availableCopies cannot exceed totalCopies" });
    }

    const existing = await Book.findOne({ isbn: normalizedIsbn });
    if (existing) {
      return res.status(409).json({ success: false, message: "Book already exists" });
    }

    const book = await Book.create({
      title,
      authors: authorList,
      isbn: normalizedIsbn,
      totalCopies,
      availableCopies,
      category: category ? String(category).toUpperCase() : "GENERAL",
      ...(coverImage && (coverImage.url || coverImage.publicId)
        ? {
          coverImage: {
            url: coverImage.url ?? null,
            publicId: coverImage.publicId ?? null,
          },
        }
        : {}),
    });

    return res.status(201).json({
      success: true,
      message: "Book added successfully",
      book,
    });
  } catch (error) {
    if (error?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid book data", error: error.message });
    }
    return res.status(500).json({ success: false, message: "Error adding book", error: error.message });
  }
};

// PATCH /api/admin/access/books/:id
export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      authors,
      author,
      isbn,
      totalCopies,
      availableCopies,
      category,
      coverImage,
    } = req.body;

    const has = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
    const setOps = {};
    const unsetOps = {};

    if (has("title")) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ success: false, message: "title must be a non-empty string" });
      }
      setOps.title = title.trim();
    }

    if (has("authors") || has("author")) {
      let list;
      if (has("authors")) {
        if (!Array.isArray(authors)) {
          return res.status(400).json({ success: false, message: "authors must be  a non-empty string" });
        }
        list = authors.map((a) => (typeof a === "string" ? a.trim() : "")).filter(Boolean);
      } else {
        list = typeof author === "string" && author.trim() ? [author.trim()] : [];
      }

      if (list.length === 0) {
        return res.status(400).json({ success: false, message: "At least one valid author is required" });
      }
      setOps.authors = list;
    }

    if (has("isbn")) {
      if (typeof isbn !== "string" || !isbn.trim()) {
        return res.status(400).json({ success: false, message: "isbn must be a non-empty string" });
      }
      setOps.isbn = isbn.replace(/[-\s]/g, "").toUpperCase();
    }

    if (has("totalCopies")) {
      if (typeof totalCopies !== "number" || !Number.isInteger(totalCopies) || totalCopies < 0) {
        return res.status(400).json({ success: false, message: "totalCopies must be a non-negative integer" });
      }
      setOps.totalCopies = totalCopies;
    }

    if (has("availableCopies")) {
      if (typeof availableCopies !== "number" || !Number.isInteger(availableCopies) || availableCopies < 0) {
        return res.status(400).json({ success: false, message: "availableCopies must be a non-negative integer" });
      }
      setOps.availableCopies = availableCopies;
    }

    // Copy counts change while an admin has the edit form open (students
    // reserve, books get returned), so they're never blindly overwritten:
    //  - totalCopies alone: availableCopies moves by the same amount ($inc),
    //    e.g. adding 2 new copies adds 2 available copies.
    //  - availableCopies given explicitly: applied only if stock hasn't
    //    changed since the form was loaded (compare-and-set), else 409.
    let preUpdateAvailableCopies = null;
    const stockFilter = {};
    const incOps = {};
    if (setOps.availableCopies !== undefined || setOps.totalCopies !== undefined) {
      const existing = await Book.findById(id).select("totalCopies availableCopies");
      if (!existing) {
        return res.status(404).json({ success: false, message: "Book not found" });
      }
      preUpdateAvailableCopies = existing.availableCopies;
      stockFilter.totalCopies = existing.totalCopies;
      stockFilter.availableCopies = existing.availableCopies;

      if (setOps.availableCopies === undefined) {
        const delta = setOps.totalCopies - existing.totalCopies;
        if (existing.availableCopies + delta < 0) {
          return res.status(400).json({
            success: false,
            message: `Can't reduce total below the ${existing.totalCopies - existing.availableCopies} copies currently issued or reserved`,
          });
        }
        delete setOps.totalCopies;
        if (delta !== 0) incOps.totalCopies = delta;
        if (delta !== 0) incOps.availableCopies = delta;
      } else {
        const nextTotal = setOps.totalCopies !== undefined ? setOps.totalCopies : existing.totalCopies;
        if (setOps.availableCopies > nextTotal) {
          return res.status(400).json({ success: false, message: "availableCopies cannot exceed totalCopies" });
        }
      }
    }

    if (has("category")) {
      const normalized = String(category).toUpperCase();
      if (!ALLOWED_CATEGORIES.includes(normalized)) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
        });
      }
      setOps.category = normalized;
    }

    if (has("coverImage")) {
      if (coverImage === null) {
        unsetOps["coverImage"] = "";
      } else if (typeof coverImage === "object") {
        // Check the keys on coverImage itself (this used to check req.body,
        // so cover edits were silently ignored)
        const coverHas = (k) => Object.prototype.hasOwnProperty.call(coverImage, k);
        if (coverHas("url")) {
          setOps["coverImage.url"] = typeof coverImage.url === "string" && coverImage.url.trim() ? coverImage.url.trim() : null;
        }
        if (coverHas("publicId")) {
          setOps["coverImage.publicId"] = typeof coverImage.publicId === "string" && coverImage.publicId.trim() ? coverImage.publicId.trim() : null;
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "coverImage must be an object { url, publicId } or null to clear",
        });
      }
    }

    if (
      Object.keys(setOps).length === 0 &&
      Object.keys(unsetOps).length === 0 &&
      Object.keys(incOps).length === 0
    ) {
      const current = await Book.findById(id);
      if (!current) return res.status(404).json({ success: false, message: "Book not found" });
      return res.status(200).json({ success: true, message: "No changes applied", book: current });
    }

    const updateDoc = {};
    if (Object.keys(setOps).length) updateDoc.$set = setOps;
    if (Object.keys(unsetOps).length) updateDoc.$unset = unsetOps;
    if (Object.keys(incOps).length) updateDoc.$inc = incOps;

    const book = await Book.findOneAndUpdate({ _id: id, ...stockFilter }, updateDoc, {
      new: true,
      runValidators: true,
      context: "query",
    });

    if (!book) {
      if (Object.keys(stockFilter).length && (await Book.exists({ _id: id }))) {
        return res.status(409).json({
          success: false,
          message: "Stock changed while you were editing (a copy was reserved, issued or returned). Reload and try again.",
        });
      }
      return res.status(404).json({ success: false, message: "Book not found" });
    }

    if (typeof preUpdateAvailableCopies === "number" && book.availableCopies > preUpdateAvailableCopies) {
      enqueueWaitlistAvailability(book._id, book.availableCopies - preUpdateAvailableCopies);
    }

    return res.status(200).json({ success: true, message: "Book updated", book });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Another book already uses that ISBN" });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid book data", error: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(400).json({ success: false, message: `Invalid value for ${error.path}` });
    }
    return res.status(500).json({ success: false, message: "Error updating book", error: error.message });
  }
};

// DELETE /api/admin/access/books/:id
export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    // Deleting a book that's out on loan or held for a student would leave
    // those records pointing at nothing, so require them to be closed first.
    const [activeLoans, pendingReservations] = await Promise.all([
      IssuedBook.countDocuments({ book: id, returnedAt: null }),
      ReserveBook.countDocuments({ book: id, status: "pending" }),
    ]);
    if (activeLoans > 0 || pendingReservations > 0) {
      return res.status(409).json({
        success: false,
        message: `Can't delete: ${activeLoans} copy/copies still issued and ${pendingReservations} pending reservation(s). Return or let them expire first.`,
      });
    }

    const book = await Book.findByIdAndDelete(id);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    // Nobody can be waiting for a book that no longer exists
    await Waitlist.deleteMany({ book: book._id });

    return res.status(200).json({ success: true, message: "Book deleted" });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid book id" });
    }
    return res.status(500).json({ success: false, message: "Error deleting book", error: error.message });
  }
};

// GET /api/admin/access/books
export const getBooksForAdmin = async (req, res) => {
  try {
    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 3);
    const { category, availability } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (availability === "available") {
      filter.availableCopies = { $gt: 0 };
    } else if (availability === "unavailable") {
      filter.availableCopies = 0;
    }

    const totalBooks = await Book.countDocuments(filter);
    const books = await Book.find(filter)
      .select("title authors isbn totalCopies availableCopies category coverImage description")
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalBooks / limit);

    return res.status(200).json({
      success: true,
      count: books.length,
      totalBooks,
      pageCount,
      offset,
      limit,
      data: books,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching books", error: error.message });
  }
};

// GET /api/admin/access/books/search
export const searchBook = async (req, res) => {
  try {
    const query = asTrimmedString(req.query.query);
    if (!query) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 3);
    const { filter, searchedFields } = buildBookSearchFilter(query);

    const totalMatches = await Book.countDocuments(filter);
    const books = await Book.find(filter)
      .select("title authors isbn totalCopies availableCopies category coverImage description")
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalMatches / limit);

    return res.status(200).json({
      success: true,
      query,
      searchedFields,
      count: books.length,
      totalMatches,
      pageCount,
      offset,
      limit,
      data: books,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error searching books", error: error.message });
  }
};

// =====================================================
// STUDENT MANAGEMENT
// =====================================================

// GET /api/admin/access/students
export const getAllStudent = async (req, res) => {
  try {
    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 3);
    const { department, Session } = req.query;

    const filter = { role: "user" };
    if (department) filter.department = department;
    if (Session) filter.Session = Session;

    const totalStudents = await User.countDocuments(filter);
    const students = await User.find(filter)
      .select("name email regNo Session department role fine")
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalStudents / limit);

    return res.status(200).json({
      success: true,
      count: students.length,
      totalStudents,
      pageCount,
      offset,
      limit,
      filters: {
        department: department || "all",
        Session: Session || "all",
      },
      data: students,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching students", error: error.message });
  }
};

// POST /api/admin/access/students/search
export const searchStudent = async (req, res) => {
  try {
    const regNo = asTrimmedString(req.body?.regNo);
    if (!regNo) {
      return res.status(400).json({ success: false, message: "regNo is required" });
    }

    const student = await User.findOne({ regNo }).select("name email regNo Session department fine");
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const [issuedBooks, reservations] = await Promise.all([
      IssuedBook.find({ user: student._id }).populate("book", "title authors"),
      ReserveBook.find({ user: student._id }).populate("book", "title authors"),
    ]);

    return res.status(200).json({
      success: true,
      student,
      issuedBooks,
      reservations,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error searching student", error: error.message });
  }
};

// GET /api/admin/access/students/search?query=...
export const searchRegisteredStudents = async (req, res) => {
  try {
    const trimmedQuery = asTrimmedString(req.query.query);
    if (!trimmedQuery) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 10);
    const safe = escapeRegex(trimmedQuery);

    const filter = {
      role: "user",
      $or: [
        { name: { $regex: safe, $options: "i" } },
        { regNo: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ],
    };

    const totalStudents = await User.countDocuments(filter);
    const students = await User.find(filter)
      .select("name email regNo Session department role fine")
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalStudents / limit);

    return res.status(200).json({
      success: true,
      query: trimmedQuery,
      count: students.length,
      totalStudents,
      pageCount,
      offset,
      limit,
      data: students,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error searching registered students",
      error: error.message,
    });
  }
};

// =====================================================
// ISSUE FLOW
// =====================================================

// POST /api/admin/access/books/:bookId/issue/:reservationId
export const issueReservedBook = async (req, res) => {
  try {
    const { bookId, reservationId } = req.params;

    const reservation = await ReserveBook.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({ success: false, message: "Reservation not found" });
    }
    if (reservation.status !== "pending") {
      return res.status(409).json({ success: false, message: `Reservation is not pending (current status: ${reservation.status})` });
    }
    if (reservation.expiresAt && new Date(reservation.expiresAt) <= new Date()) {
      return res.status(409).json({ success: false, message: "Reservation has expired and cannot be issued" });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    if (reservation.book.toString() !== book._id.toString()) {
      return res.status(400).json({ success: false, message: "Reservation does not match this book" });
    }

    const user = await User.findById(reservation.user);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.fine && user.fine > 0) {
      return res.status(403).json({
        success: false,
        message: "Student has an outstanding fine. Please clear the fine before issuing a book.",
        data: { fine: user.fine },
      });
    }

    const alreadyIssued = await IssuedBook.findOne({
      book: book._id,
      user: user._id,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (alreadyIssued) {
      return res.status(409).json({
        success: false,
        message: `Student already has an active copy of this book (status: ${alreadyIssued.status})`,
        data: {
          issuedId: alreadyIssued.issuedId,
          status: alreadyIssued.status,
          dueDate: alreadyIssued.dueDate,
        },
      });
    }

    const borrowedCount = await IssuedBook.countDocuments({
      user: user._id,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (borrowedCount >= 3) return res.status(409).json({ success: false, message: "Borrowing limit (3) reached" });

    // Note: availableCopies was already decremented when the book was reserved.

    // Create the loan first, then claim the reservation atomically. If the
    // reservation was expired by the cron (or issued by another click) in
    // the meantime, undo the loan — never leave a reservation marked
    // "issued" with no loan behind it, or a loan without its copy.
    const issuedBook = await IssuedBook.create({
      book: book._id,
      bookTitle: book.title,
      bookAuthors: book.authors,
      user: user._id,
      userName: user.name,
      userRegNo: user.regNo,
      userDepartment: user.department,
      userSession: user.Session,
      reservation: reservation._id,
    });

    const claimed = await ReserveBook.findOneAndUpdate(
      { _id: reservation._id, status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { status: "issued" } },
      { new: true }
    );
    if (!claimed) {
      await IssuedBook.deleteOne({ _id: issuedBook._id });
      return res.status(409).json({
        success: false,
        message: "Reservation expired or was already issued. Refresh and try again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Book issued successfully",
      data: issuedBook,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "This reservation is already being issued" });
    }
    return res.status(500).json({ success: false, message: "Error issuing book", error: error.message });
  }
};

// POST /api/admin/access/books/:bookId/issue-to
export const issueBookDirect = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { regNo } = req.body || {};

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (book.availableCopies <= 0) {
      return res.status(409).json({
        success: false,
        message: "No available copies. Student should reserve or join the waitlist instead.",
      });
    }

    if (!regNo || !String(regNo).trim()) {
      return res.status(400).json({ success: false, message: "regNo is required in the request body" });
    }

    const trimmedRegNo = String(regNo).trim();
    const user = await User.findOne({ regNo: trimmedRegNo });
    if (!user) return res.status(404).json({ success: false, message: `Student not found for regNo: ${trimmedRegNo}` });
    if (user.role && user.role !== "user") {
      return res.status(400).json({ success: false, message: "Target account is not a student" });
    }

    if (user.fine && user.fine > 0) {
      return res.status(403).json({
        success: false,
        message: "Student has an outstanding fine. Please clear the fine before issuing a book.",
        data: { fine: user.fine },
      });
    }

    const alreadyIssued = await IssuedBook.findOne({
      book: book._id,
      user: user._id,
      status: { $in: ["borrowed", "overdue"] },
    });
    if (alreadyIssued) {
      return res.status(409).json({
        success: false,
        message: `Student already has an active copy of this book (status: ${alreadyIssued.status})`,
        data: {
          issuedId: alreadyIssued.issuedId,
          status: alreadyIssued.status,
          dueDate: alreadyIssued.dueDate,
        },
      });
    }

    const active = await countActiveBooks(user._id);
    if (active.total >= active.limit) {
      return res.status(409).json({
        success: false,
        message: `Limit (${active.limit}) reached for this student: ${active.issued} issued, ${active.reserved} reserved`,
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
        message: "No available copies left. Student should reserve or join the waitlist instead.",
      });
    }

    let issuedBook;
    try {
      issuedBook = await IssuedBook.create({
        book: updatedBook._id,
        bookTitle: updatedBook.title,
        bookAuthors: updatedBook.authors,
        user: user._id,
        userName: user.name,
        userRegNo: user.regNo,
        userDepartment: user.department,
        userSession: user.Session,
        reservation: null,
      });
    } catch (err) {
      await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
      throw err;
    }

    return res.status(201).json({
      success: true,
      message: "Book issued successfully (direct)",
      data: issuedBook,
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({ success: false, message: `Invalid ${error.path}` });
    }
    return res.status(500).json({ success: false, message: "Error issuing book directly", error: error.message });
  }
};

// POST /api/admin/access/issued/:issuedId/return
export const returnIssuedBook = async (req, res) => {
  try {
    const { issuedId } = req.params;
    const existing = await IssuedBook.findById(issuedId);

    if (!existing) return res.status(404).json({ success: false, message: "Issued book not found" });
    if (existing.status === "returned") {
      return res.status(400).json({ success: false, message: "Book already returned" });
    }

    // Charge any overdue days not yet billed (e.g. the server was asleep
    // when the daily charge would have run). Idempotent.
    const now = new Date();
    const lateFineCharged = await chargeLateFine(existing, now);

    // Atomic claim: a double-clicked Return can only succeed once, so the
    // copy is only put back on the shelf once.
    const issuedBook = await IssuedBook.findOneAndUpdate(
      { _id: existing._id, status: { $ne: "returned" } },
      { $set: { status: "returned", returnedAt: now } },
      { new: true }
    );
    if (!issuedBook) {
      return res.status(400).json({ success: false, message: "Book already returned" });
    }

    const book = await Book.findByIdAndUpdate(
      issuedBook.book,
      { $inc: { availableCopies: 1 } },
      { new: true }
    );

    enqueueWaitlistAvailability(issuedBook.book, 1);

    return res.status(200).json({
      success: true,
      message: lateFineCharged > 0
        ? `Book returned. Late fine of ৳${lateFineCharged} added to the student's account.`
        : "Book returned successfully",
      issuedBook,
      book,
      lateFineCharged,
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid issued book id" });
    }
    return res.status(500).json({ success: false, message: "Error returning book", error: error.message });
  }
};

// =====================================================
// REPORTING
// =====================================================

// GET /api/admin/access/issued
export const getIssuedBook = async (req, res) => {
  try {
    const { status, regNo, bookId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (regNo) filter.userRegNo = regNo;
    if (bookId) filter.book = bookId;

    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 3);

    const totalIssued = await IssuedBook.countDocuments(filter);
    const issuedBooks = await IssuedBook.find(filter)
      .populate("book", "title authors")
      .populate("user", "name email regNo department Session")
      .sort({ borrowedAt: -1 })
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalIssued / limit);

    return res.status(200).json({
      success: true,
      count: issuedBooks.length,
      totalIssued,
      pageCount,
      offset,
      limit,
      data: issuedBooks,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching issued books", error: error.message });
  }
};

// GET /api/admin/access/reservations
export const getAllReservation = async (req, res) => {
  try {
    const { status, regNo, bookId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (regNo) filter.user_regNo = regNo;
    if (bookId) filter.book = bookId;

    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 3);

    const totalReservations = await ReserveBook.countDocuments(filter);
    const reservations = await ReserveBook.find(filter)
      .populate("book", "title authors")
      .populate("user", "name email regNo department Session")
      .sort({ reservedAt: -1 })
      .skip(offset)
      .limit(limit);

    const pageCount = Math.ceil(totalReservations / limit);

    return res.status(200).json({
      success: true,
      count: reservations.length,
      totalReservations,
      pageCount,
      offset,
      limit,
      data: reservations,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching reservations", error: error.message });
  }
};

// =====================================================
// DASHBOARD STATS
// =====================================================

// GET /api/admin/access/stats/users
export const getUserStats = async (req, res) => {
  try {
    const [totalUsers, totalStudents] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "user" }),
    ]);

    return res.status(200).json({
      success: true,
      message: "User stats fetched successfully",
      data: { totalUsers, totalStudents },
    });
  } catch (error) {
    console.error("getUserStats error:", error);
    return res.status(500).json({ success: false, message: "Error fetching user stats", error: error.message });
  }
};

// GET /api/admin/access/stats/books
export const getBookStats = async (req, res) => {
  try {
    const totalBookTitles = await Book.countDocuments();
    const books = await Book.find().select("totalCopies availableCopies").lean();

    let totalCopies = 0;
    let availableCopies = 0;
    for (const book of books) {
      totalCopies += book.totalCopies;
      availableCopies += book.availableCopies;
    }
    const issuedCopies = Math.max(totalCopies - availableCopies, 0);

    return res.status(200).json({
      success: true,
      message: "Book stats fetched successfully",
      data: {
        totalBookTitles,
        totalCopies,
        availableCopies,
        issuedCopies,
      },
    });
  } catch (error) {
    console.error("getBookStats error:", error);
    return res.status(500).json({ success: false, message: "Error fetching book stats", error: error.message });
  }
};

// GET /api/admin/access/stats/issued
export const getIssueStats = async (req, res) => {
  try {
    const [activeIssued, totalReturned] = await Promise.all([
      IssuedBook.countDocuments({ status: { $in: ["borrowed", "overdue"] } }),

    ]);

    return res.status(200).json({
      success: true,
      message: "Issue stats fetched successfully",
      data: {
        totalIssued: activeIssued,
        activeIssued,
      },
    });
  } catch (error) {
    console.error("getIssueStats error:", error);
    return res.status(500).json({ success: false, message: "Error fetching issue stats", error: error.message });
  }
};


//GET /api/admin/access/stats/overdue

export const getOverdueIssueStats = async (req, res) => {
  try {
    const now = new Date();
    const overdueCount = await IssuedBook.countDocuments({
      $or: [
        { status: "overdue" },
        { status: "borrowed", dueDate: { $lte: now } },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Overdue issue stats fetched successfully",
      data: {
        overdueCount,
      },
    });
  } catch (error) {
    console.error("getOverdueIssueStats error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching overdue issue stats",
      error: error.message,
    });
  }
};

// GET /api/admin/access/stats/reservations
export const getReservationStats = async (req, res) => {
  try {
    const [activeReservations, expiredReservations, issuedReservations] = await Promise.all([
      ReserveBook.countDocuments({ status: "pending" }),
      ReserveBook.countDocuments({ status: "expired" }),
      ReserveBook.countDocuments({ status: "issued" }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Reservation stats fetched successfully",
      data: {
        totalReservations: activeReservations + expiredReservations + issuedReservations,
        activeReservations,
        expiredReservations,
        issuedReservations,
      },
    });
  } catch (error) {
    console.error("getReservationStats error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching reservation stats",
      error: error.message,
    });
  }
};

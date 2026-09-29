import mongoose from "mongoose";

import { LOAN_DURATION_DAYS, DAY_MS } from "../config/library.js";

const issuedBookSchema = new mongoose.Schema(
  {
    issuedId: {
      type: String,
      unique: true,
      index: true,
      immutable: true,
      default: () => `IS-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: [true, "Book is required"],
      index: true,
    },
    bookTitle: {
      type: String,
      required: [true, "Book title is required"],
      trim: true,
    },
    bookAuthors: {
      type: [String],
      required: [true, "Book author(s) is required"],
      validate: {
        validator: (authors) =>
          Array.isArray(authors) &&
          authors.length > 0 &&
          authors.every((a) => typeof a === "string" && a.trim().length > 0),
        message: "At least one valid book author is required",
      },
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    userName: { type: String, required: true, trim: true },
    userRegNo: { type: String, required: true, trim: true, index: true },
    userDepartment: { type: String, required: true, trim: true },
    userSession: { type: String, required: true, trim: true },
    borrowedAt: { type: Date, required: true, default: Date.now },
    dueDate: {
      type: Date,
      required: true,
      default: function () {
        return new Date(this.borrowedAt.getTime() + LOAN_DURATION_DAYS * DAY_MS);
      },
      index: true,
    },
    returnedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["borrowed", "returned", "overdue"],
      default: "borrowed",
      index: true,
    },
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReservedBook",
      default: null,
      index: true,
    },
    // Full overdue days already added to the student's fine (see
    // services/late-fine-service.js). Stored so charging is idempotent.
    lateFineDaysCharged: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

issuedBookSchema.index({ user: 1, borrowedAt: -1 });
issuedBookSchema.index({ book: 1, borrowedAt: -1 });
issuedBookSchema.index({ status: 1, dueDate: 1 });
issuedBookSchema.index(
  { book: 1, user: 1 },
  { unique: true, partialFilterExpression: { returnedAt: null } }
);

export const IssuedBook = mongoose.model("IssuedBook", issuedBookSchema);
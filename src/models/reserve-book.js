import mongoose from "mongoose";

import { RESERVATION_HOLD_MINUTES, MINUTE_MS } from "../config/library.js";

const reserveBookSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: [true, "Book is required"],
      index: true,
    },
    book_title: { type: String, required: true, trim: true },
    book_authors: [{ type: String, trim: true }],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    user_name: { type: String, required: true, trim: true },
    user_regNo: { type: String, required: true, trim: true, index: true },
    user_department: { type: String, required: true, trim: true },
    user_Session: { type: String, required: true, trim: true },
    reservedId: {
      type: String,
      unique: true,
      index: true,
      immutable: true,
      default: () => `RB-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    },
    status: {
      type: String,
      enum: ["pending", "issued", "expired"],
      default: "pending",
      index: true,
    },
    reservedAt: { type: Date, default: Date.now, immutable: true },
    expiresAt: {
      type: Date,
      required: true,
      default: function () {
        return new Date(this.reservedAt.getTime() + RESERVATION_HOLD_MINUTES * MINUTE_MS);
      },
      index: true,
    },
  },
  { timestamps: true }
);

reserveBookSchema.index({ user: 1, reservedAt: -1 });
reserveBookSchema.index({ book: 1, reservedAt: -1 });
reserveBookSchema.index({ book: 1, status: 1, reservedAt: 1 });

export const ReserveBook = mongoose.model("ReservedBook", reserveBookSchema);
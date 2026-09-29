/**
 * Book search helper for multi-field search queries (title, authors, category, isbn).
 */
import { escapeRegex } from "./escape-regex.js";

const normalizeIsbn = (str) =>
  typeof str === "string" ? str.replace(/[-\s]/g, "").toUpperCase() : "";

const ALLOWED_CATEGORIES = [
  "CSE",
  "EEE",
  "CE",
  "PHYSICS",
  "CHEMISTRY",
  "GENERAL",
  "MATH",
  "ARTS",
];

export const buildBookSearchFilter = (rawQuery) => {
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (!query) return { filter: null, normalizedIsbn: "" };

  const safe = escapeRegex(query);
  const isbn = normalizeIsbn(query);
  const categoryUpper = query.toUpperCase();

  const orClauses = [
    { title: { $regex: `^${safe}`, $options: "i" } },
    { authors: { $regex: `^${safe}`, $options: "i" } },
  ];

  if (isbn && /^[\dX]{10,13}$/i.test(isbn)) {
    orClauses.push({ isbn });
  }

  if (ALLOWED_CATEGORIES.includes(categoryUpper)) {
    orClauses.push({ category: categoryUpper });
  }

  return {
    filter: { $or: orClauses },
    normalizedIsbn: isbn,
    searchedFields: ["title", "authors", "category", "isbn"],
  };
};

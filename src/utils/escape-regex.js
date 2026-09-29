/**
 * Escape user input before putting it in a MongoDB $regex, so characters
 * like ( ) [ ] * + ? . are matched literally. Without this, a search for
 * "Operating Systems (3rd ed" is an invalid pattern (500 error), and a
 * crafted pattern like "(a+)+$" can make the database do runaway work.
 */
export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Query-string / body values can arrive as arrays or objects
 * (?q=a&q=b, or JSON like {"$ne": null}). Only accept plain strings.
 */
export const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

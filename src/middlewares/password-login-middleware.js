/**
 * Middleware: Gate the legacy regNo + password student login.
 *
 * Students sign in with Google in production. The password routes
 * (register / login / change-password) are a local-development fallback
 * only, so they answer 404 unless explicitly enabled outside production.
 */
export function isPasswordLoginEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PASSWORD_LOGIN === "true"
  );
}

export function requirePasswordLogin(req, res, next) {
  if (!isPasswordLoginEnabled()) {
    return res.status(404).json({ success: false, message: "Route not found" });
  }
  return next();
}

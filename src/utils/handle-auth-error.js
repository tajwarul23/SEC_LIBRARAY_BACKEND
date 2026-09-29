export function handleAuthError(res, error, label) {
  // Expected outcomes (wrong password, unknown regNo, validation) only get a
  // one-line log; full stack traces are kept for real server errors.
  const isExpected =
    error?.name === "ZodError" ||
    error?.name === "ValidationError" ||
    error?.code === 11000 ||
    (error?.statusCode && error.statusCode < 500);
  if (isExpected) {
    console.warn(`${label}: ${error?.message}`);
  } else {
    console.error(`${label} error:`, error);
  }

  if (error?.name === "ZodError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.flatten().fieldErrors,
    });
  }

  if (error?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Database validation failed",
    });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Resource already exists",
    });
  }

  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message,
  });
}

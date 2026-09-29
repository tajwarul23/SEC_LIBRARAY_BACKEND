/**
 * Create an admin account directly in the database.
 *
 * Admin registration over HTTP requires an existing admin, so this is how
 * the very first admin is created on a fresh database.
 *
 * Usage (values come from env vars so the password isn't a CLI argument):
 *   PowerShell:
 *     $env:SEED_ADMIN_NAME="Head Librarian"; $env:SEED_ADMIN_EMAIL="librarian@example.com"
 *     $env:SEED_ADMIN_REGNO="admin01"; $env:SEED_ADMIN_PASSWORD="StrongPass123"
 *     npm run seed:admin
 *   bash:
 *     SEED_ADMIN_NAME="Head Librarian" SEED_ADMIN_EMAIL="librarian@example.com" \
 *     SEED_ADMIN_REGNO="admin01" SEED_ADMIN_PASSWORD="StrongPass123" npm run seed:admin
 */
import "dotenv/config";
import mongoose from "mongoose";
import { registerAdminSchema } from "../src/validators/admin-validator.js";
import { registerAdmin } from "../src/services/admin-register-service.js";

async function main() {
  const parsed = registerAdminSchema.safeParse({
    name: process.env.SEED_ADMIN_NAME,
    email: process.env.SEED_ADMIN_EMAIL,
    regNo: process.env.SEED_ADMIN_REGNO,
    password: process.env.SEED_ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    console.error("Invalid or missing SEED_ADMIN_* values:");
    console.error(parsed.error.flatten().fieldErrors);
    console.error("Password needs 8+ chars with an uppercase letter, a lowercase letter and a number.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const admin = await registerAdmin(parsed.data);
    console.log(`Admin created: ${admin.name} (regNo: ${admin.regNo})`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to create admin:", error.message);
  process.exit(1);
});

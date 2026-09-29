import { firebaseAuth } from "../config/firebase-admin.js";
import StudentAuthentication from "../models/student-authentication-model.js";
import User from "../models/user-auth-models.js";

function makeError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// "Tajwarul Chowdhury" -> "T******* C********": enough for a student to
// recognise their own record, without exposing the roster to anyone who
// types in sequential regNos.
export function maskName(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0] + "*".repeat(Math.max(word.length - 1, 0)))
    .join(" ");
}

export async function checkRegNo(regNo) {
  const studentAuth = await StudentAuthentication.findOne({ regNo }).lean();
  if (!studentAuth) {
    throw makeError(
      "This registration number isn't on the platform yet. Please contact the library desk.",
      404
    );
  }

  return {
    regNo: studentAuth.regNo,
    name: maskName(studentAuth.name),
    claimed: Boolean(studentAuth.firebaseUid),
  };
}

async function verifyGoogleIdToken(idToken) {
  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(idToken);
  } catch {
    throw makeError("Google sign-in failed. Please try again.", 401);
  }

  if (!decoded.email_verified) {
    throw makeError("Your Google account's email is not verified.", 401);
  }

  return decoded;
}

async function createUserFromStudentAuth(studentAuth) {
  try {
    return await User.create({
      name: studentAuth.name,
      regNo: studentAuth.regNo,
      email: studentAuth.gmail,
      gender: studentAuth.gender,
      department: studentAuth.department,
      Session: studentAuth.Session,
      role: "user",
    });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await User.findOne({ regNo: studentAuth.regNo });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function googleAuthenticate({ regNo, idToken }) {
  const decoded = await verifyGoogleIdToken(idToken);

  const studentAuth = await StudentAuthentication.findOne({ regNo });
  if (!studentAuth) {
    throw makeError(
      "This registration number isn't on the platform yet. Please contact the library desk.",
      404
    );
  }

  // Already claimed — this is a login, not a claim.
  if (studentAuth.firebaseUid) {
    if (studentAuth.firebaseUid !== decoded.uid) {
      throw makeError(
        "This registration number is linked to a different Google account.",
        403
      );
    }

    const user = await User.findOne({ regNo: studentAuth.regNo });
    if (!user) {
      throw makeError(
        "Your account record is missing. Please contact the library desk.",
        404
      );
    }
    return user;
  }

  // Unclaimed — verify the Google account matches the roster before binding.
  if (decoded.email?.toLowerCase() !== studentAuth.gmail.toLowerCase()) {
    throw makeError(
      "This Google account doesn't match the email on file for this registration number.",
      403
    );
  }

  const existingBinding = await StudentAuthentication.findOne({
    firebaseUid: decoded.uid,
  }).lean();
  if (existingBinding) {
    throw makeError(
      "This Google account is already linked to another registration number.",
      409
    );
  }

  let claimed;
  try {
    claimed = await StudentAuthentication.findOneAndUpdate(
      { _id: studentAuth._id, firebaseUid: { $exists: false } },
      { $set: { firebaseUid: decoded.uid } },
      { new: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(
        "This Google account is already linked to another registration number.",
        409
      );
    }
    throw err;
  }

  if (!claimed) {
    throw makeError(
      "This registration number was just claimed. Please try signing in again.",
      409
    );
  }

  const user =
    (await User.findOne({ regNo: claimed.regNo })) ||
    (await createUserFromStudentAuth(claimed));

  return user;
}

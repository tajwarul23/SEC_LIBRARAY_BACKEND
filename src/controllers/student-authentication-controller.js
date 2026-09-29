import StudentAuthentication from "../models/student-authentication-model.js";
import User from "../models/user-auth-models.js";
import TemporaryRegNo from "../models/TemporaryRegNo.js";
import { countActiveBooks } from "../services/borrow-limit-service.js";
import { clampLimit, clampOffset, MAX_PAGE_SIZE } from "../utils/pagination.js";
import { escapeRegex, asTrimmedString } from "../utils/escape-regex.js";

export const createStudentAuthentication = async (req, res) => {
  try {
    const { name, gmail, regNo, gender, Session, department } = req.body;

    if (!name || !gmail || !regNo || !gender || !Session || !department) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingEmail = await StudentAuthentication.findOne({ gmail });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Student authentication with this Gmail already exists",
      });
    }

    const existingRegNo = await StudentAuthentication.findOne({ regNo });
    if (existingRegNo) {
      return res.status(409).json({
        success: false,
        message: "Student authentication with this registration number already exists",
      });
    }

    const savedStudentAuthentication = await StudentAuthentication.create({
      name,
      gmail,
      regNo,
      gender,
      Session,
      department,
    });

    console.log("Student authentication created successfully:", savedStudentAuthentication);

    return res.status(201).json({
      success: true,
      message: "Student authentication created successfully",
      data: savedStudentAuthentication,
    });
  } catch (error) {
    console.error("Error creating student authentication:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create student authentication data",
      error: error.message,
    });
  }
};

export const getAllStudentAuthentications = async (req, res) => {
  try {
    const offset = clampOffset(req.query.offset);
    const limit = clampLimit(req.query.limit, 20);
    const { department, Session } = req.query;

    const filter = {};
    if (department) filter.department = department;
    if (Session) filter.Session = Session;

    const totalStudents = await StudentAuthentication.countDocuments(filter);
    const studentAuthentications = await StudentAuthentication.find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 });

    const pageCount = Math.ceil(totalStudents / limit);

    return res.status(200).json({
      success: true,
      message: "Student authentications retrieved successfully",
      data: studentAuthentications,
      pagination: {
        totalStudents,
        offset,
        limit,
        pageCount,
      },
      filters: {
        department: department || "all",
        Session: Session || "all",
      },
    });
  } catch (error) {
    console.error("Error retrieving student authentications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve student authentications",
      error: error.message,
    });
  }
};

export const deleteStudentAuthentication = async (req, res) => {
  try {
    const { id } = req.params;
    const finds = await StudentAuthentication.findById(id);

    if (!finds) {
      return res.status(404).json({
        success: false,
        message: "Student authentication not found",
      });
    }

    const findUserByRegNo = await User.findOne({ regNo: finds.regNo });

    // Don't delete a student who still has library items or an unpaid fine:
    // their loans/reservations would be orphaned and the fine lost.
    if (findUserByRegNo) {
      const active = await countActiveBooks(findUserByRegNo._id);
      const fine = findUserByRegNo.fine || 0;
      if (active.total > 0 || fine > 0) {
        return res.status(409).json({
          success: false,
          message: `Can't delete: student has ${active.issued} book(s) issued, ${active.reserved} reserved and a fine of ৳${fine}. Clear these first.`,
        });
      }
    }

    // Upsert: deleting the same regNo twice within the block window used to
    // fail on the unique index and leave the student half-deleted.
    await TemporaryRegNo.updateOne(
      { regNo: finds.regNo },
      { $set: { expiresAt: new Date(Date.now() + 60 * 60 * 1000) } },
      { upsert: true }
    );

    if (findUserByRegNo) {
      await User.findByIdAndDelete(findUserByRegNo._id);
    }

    const deletedStudentAuthentication = await StudentAuthentication.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Student authentication deleted successfully",
      data: deletedStudentAuthentication,
    });
  } catch (error) {
    console.error("Error deleting student authentication:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete student authentication",
      error: error.message,
    });
  }
};

export const searchStudentAuthentication = async (req, res) => {
  try {
    const query = asTrimmedString(req.body?.query);
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const safe = escapeRegex(query);
    const searchResults = await StudentAuthentication.find({
      $or: [
        { name: { $regex: safe, $options: "i" } },
        { gmail: { $regex: safe, $options: "i" } },
        { regNo: { $regex: safe, $options: "i" } },
      ],
    }).limit(MAX_PAGE_SIZE);

    return res.status(200).json({
      success: true,
      message: "Search results retrieved successfully",
      data: searchResults,
    });
  } catch (error) {
    console.error("Error searching student authentications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search student authentications",
      error: error.message,
    });
  }
};
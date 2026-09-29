import { escapeRegex, asTrimmedString } from "../utils/escape-regex.js";
import ResearchPaper from "../models/research-paper-model.js";

// Looks for an existing paper with the same paperLink or the same doi.
// Both are checked regardless of status (pending/approved/rejected) so a
// paper can't be re-submitted or re-created while an earlier copy already
// exists in any state. excludeId lets update flows skip the record being
// edited so it doesn't collide with itself.
const findDuplicateResearchPaper = async ({ paperLink, doi }, excludeId) => {
  const orConditions = [];
  if (paperLink && paperLink.trim()) orConditions.push({ paperLink: paperLink.trim() });
  if (doi && doi.trim()) orConditions.push({ doi: doi.trim() });
  if (orConditions.length === 0) return null;

  const filter = { $or: orConditions };
  if (excludeId) filter._id = { $ne: excludeId };

  return ResearchPaper.findOne(filter).lean();
};

const duplicateResearchPaperMessage = (duplicate, { paperLink, doi }) => {
  const matchedOnDoi = Boolean(doi && doi.trim() && duplicate.doi === doi.trim());
  const matchedOnLink = Boolean(paperLink && duplicate.paperLink === paperLink.trim());
  if (matchedOnDoi && matchedOnLink) return "A research paper with this paper link and DOI already exists";
  if (matchedOnDoi) return "A research paper with this DOI already exists";
  return "A research paper with this paper link already exists";
};

// User (Student) submits a research paper (saved as pending)
export const submitResearchPaperByUser = async (req, res) => {
  try {
    const {
      title,
      authors,
      abstract,
      category,
      keywords,
      paperLink,
      publicationDate,
      journalName,
      conferenceName,
      doi,
    } = req.body;

    if (!title || !authors || !category || !paperLink) {
      return res.status(400).json({
        success: false,
        message: "Title, authors, category and paper link are required",
      });
    }

    if (!Array.isArray(authors) || authors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one author is required",
      });
    }

    for (const author of authors) {
      if (!author.name || !author.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Every author must have a name",
        });
      }
    }

    const duplicate = await findDuplicateResearchPaper({ paperLink, doi });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: duplicateResearchPaperMessage(duplicate, { paperLink, doi }),
      });
    }

    const userId = req.user?.id || req.user?._id;

    const paper = await ResearchPaper.create({
      title,
      authors,
      abstract,
      category,
      keywords,
      paperLink,
      publicationDate,
      journalName,
      conferenceName,
      doi,
      status: "pending",
      submittedBy: {
        userId,
        name: req.user?.name,
        email: req.user?.email,
        regNo: req.user?.regNo,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Research paper submitted successfully and is pending admin approval",
      paper,
    });
  } catch (error) {
    console.error("Submit research paper error:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A research paper with this DOI already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to submit research paper",
    });
  }
};

// Admin directly creates a research paper (saved as approved)
export const createResearchPaper = async (req, res) => {
  try {
    const {
      title,
      authors,
      abstract,
      category,
      keywords,
      paperLink,
      publicationDate,
      journalName,
      conferenceName,
      doi,
      isPublished,
    } = req.body;

    if (!title || !authors || !category || !paperLink) {
      return res.status(400).json({
        success: false,
        message: "Title, authors, category and paper link are required",
      });
    }

    if (!Array.isArray(authors) || authors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one author is required",
      });
    }

    for (const author of authors) {
      if (!author.name || !author.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Every author must have a name",
        });
      }
    }

    const duplicate = await findDuplicateResearchPaper({ paperLink, doi });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: duplicateResearchPaperMessage(duplicate, { paperLink, doi }),
      });
    }

    const adminId = req.user?.id || req.user?._id;

    const paper = await ResearchPaper.create({
      title,
      authors,
      abstract,
      category,
      keywords,
      paperLink,
      publicationDate,
      journalName,
      conferenceName,
      doi,
      isPublished: isPublished !== undefined ? isPublished : true,
      status: "approved",
      approvedBy: {
        adminId,
        approvedAt: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Research paper created successfully",
      paper,
    });
  } catch (error) {
    console.error("Create research paper error:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A research paper with this DOI already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create research paper",
    });
  }
};

// User (Student) views all papers created by themselves (pending, approved, rejected)
export const getMyResearchPapers = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { status } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { "submittedBy.userId": userId };
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const [papers, totalPapers] = await Promise.all([
      ResearchPaper.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ResearchPaper.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalPapers / limit);

    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        limit,
        totalPapers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      papers,
    });
  } catch (error) {
    console.error("Get my research papers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your research papers",
    });
  }
};

// Public / Student: Get all approved research papers
export const getAllResearchPapers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 10, 1),
      100
    );

    const skip = (page - 1) * limit;

    const filter = {
      status: "approved",
    };

    const [papers, totalPapers] = await Promise.all([
      ResearchPaper.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      ResearchPaper.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalPapers / limit);

    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        limit,
        totalPapers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      papers,
    });
  } catch (error) {
    console.error("Get all research papers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch research papers",
    });
  }
};

// Admin: Get all research papers (all, pending, approved, or rejected)
export const getAllResearchPapersForAdmin = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const filter = {};

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const [papers, totalPapers] = await Promise.all([
      ResearchPaper.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ResearchPaper.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalPapers / limit);

    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        limit,
        totalPapers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      papers,
    });
  } catch (error) {
    console.error("Get all research papers for admin error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch research papers",
    });
  }
};

// Admin: Get only pending research papers
export const getPendingResearchPapers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { status: "pending" };

    const [papers, totalPapers] = await Promise.all([
      ResearchPaper.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ResearchPaper.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalPapers / limit);

    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        limit,
        totalPapers,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      papers,
    });
  } catch (error) {
    console.error("Get pending research papers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending research papers",
    });
  }
};

// Admin: Approve a research paper
export const approveResearchPaper = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id || req.user?._id;

    const paper = await ResearchPaper.findById(id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
    }

    if (paper.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Research paper is already approved",
      });
    }

    paper.status = "approved";
    paper.approvedBy = {
      adminId,
      approvedAt: new Date(),
    };
    paper.rejectedBy = undefined;

    await paper.save();

    return res.status(200).json({
      success: true,
      message: "Research paper approved successfully",
      paper,
    });
  } catch (error) {
    console.error("Approve research paper error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve research paper",
    });
  }
};

// Admin: Reject a research paper
export const rejectResearchPaper = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id || req.user?._id;
    const { reason } = req.body || {};

    const paper = await ResearchPaper.findById(id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
    }

    if (paper.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Research paper is already rejected",
      });
    }

    paper.status = "rejected";
    paper.rejectedBy = {
      adminId,
      rejectedAt: new Date(),
      reason: reason || "",
    };
    paper.approvedBy = undefined;

    await paper.save();

    return res.status(200).json({
      success: true,
      message: "Research paper rejected successfully",
      paper,
    });
  } catch (error) {
    console.error("Reject research paper error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject research paper",
    });
  }
};

// Get single research paper by ID (Admins can view any; users can view approved or their own pending)
export const getResearchPaperById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const isAdmin = req.user?.role === "admin";

    let filter = { _id: id };

    if (!isAdmin) {
      if (userId) {
        filter = {
          _id: id,
          isPublished: true,
          $or: [{ status: "approved" }, { "submittedBy.userId": userId }],
        };
      } else {
        filter = { _id: id, isPublished: true, status: "approved" };
      }
    }

    const paper = await ResearchPaper.findOne(filter).lean();

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
    }

    return res.status(200).json({ success: true, paper });
  } catch (error) {
    console.error("Get research paper error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch research paper",
    });
  }
};

// Search research papers
export const searchResearchPapers = async (req, res) => {
  try {
    const {
      query,
      title,
      author,
      category,
      keyword,
      journal,
      conference,
      doi,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(parseInt(page) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (currentPage - 1) * perPage;

    const userId = req.user?.id || req.user?._id;
    const isAdmin = req.user?.role === "admin";

    const filter = {};

    if (!isAdmin) {
      filter.isPublished = true;
      if (userId) {
        filter.$or = [{ status: "approved" }, { "submittedBy.userId": userId }];
      } else {
        filter.status = "approved";
      }
    } else if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const searchConditions = [];
    // Escaped so typed text is matched literally, never run as a pattern
    const term = (value) => escapeRegex(asTrimmedString(value));
    const search = term(query);

    if (search) {
      searchConditions.push({
        $or: [
          { title: { $regex: search, $options: "i" } },
          { "authors.name": { $regex: search, $options: "i" } },
          { abstract: { $regex: search, $options: "i" } },
          { keywords: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { journalName: { $regex: search, $options: "i" } },
          { conferenceName: { $regex: search, $options: "i" } },
          { doi: { $regex: search, $options: "i" } },
        ],
      });
    }

    const fieldFilters = [
      ["title", title],
      ["authors.name", author],
      ["category", category],
      ["keywords", keyword],
      ["journalName", journal],
      ["conferenceName", conference],
      ["doi", doi],
    ];
    for (const [field, value] of fieldFilters) {
      const safe = term(value);
      if (safe) searchConditions.push({ [field]: { $regex: safe, $options: "i" } });
    }

    if (searchConditions.length > 0) {
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, ...searchConditions];
        delete filter.$or;
      } else {
        filter.$and = searchConditions;
      }
    }

    const [papers, totalPapers] = await Promise.all([
      ResearchPaper.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      ResearchPaper.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalPapers / perPage);

    return res.status(200).json({
      success: true,
      search: {
        query: query || null,
        title: title || null,
        author: author || null,
        category: category || null,
        keyword: keyword || null,
        journal: journal || null,
        conference: conference || null,
        doi: doi || null,
      },
      pagination: {
        currentPage,
        limit: perPage,
        totalPapers,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      papers,
    });
  } catch (error) {
    console.error("Search research papers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search research papers",
    });
  }
};

// Admin: Update research paper
export const updateResearchPaper = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      authors,
      abstract,
      category,
      keywords,
      paperLink,
      publicationDate,
      journalName,
      conferenceName,
      doi,
      isPublished,
      status,
    } = req.body;

    if (paperLink || doi) {
      const duplicate = await findDuplicateResearchPaper({ paperLink, doi }, id);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: duplicateResearchPaperMessage(duplicate, { paperLink, doi }),
        });
      }
    }

    const paper = await ResearchPaper.findByIdAndUpdate(
      id,
      {
        title,
        authors,
        abstract,
        category,
        keywords,
        paperLink,
        publicationDate,
        journalName,
        conferenceName,
        doi,
        isPublished,
        ...(status && ["pending", "approved", "rejected"].includes(status) ? { status } : {}),
      },
      { new: true, runValidators: true }
    );

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Research paper updated successfully",
      paper,
    });
  } catch (error) {
    console.error("Update research paper error:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A research paper with this DOI already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update research paper",
    });
  }
};

// Admin: Delete research paper
export const deleteResearchPaper = async (req, res) => {
  try {
    const { id } = req.params;
    const paper = await ResearchPaper.findByIdAndDelete(id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Research paper deleted successfully",
    });
  } catch (error) {
    console.error("Delete research paper error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete research paper",
    });
  }
};
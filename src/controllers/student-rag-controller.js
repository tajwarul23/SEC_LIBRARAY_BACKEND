import { askLibraryAssistant, isRagConfigured } from "../services/student-rag-service.js";

/**
 * Smart Search (RAG Chatbot Controller)
 */



export const getSmartSearchResults = async (req, res) => {
  try {
    const { input, threadId } = req.body || {};

    if (typeof input !== "string" || !input.trim()) {
      return res.status(400).json({
        success: false,
        message: "Input is required.",
      });
    }

    if (typeof threadId !== "string" || !threadId.trim() || threadId.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A valid threadId is required.",
      });
    }

    if (!isRagConfigured()) {
      return res.status(503).json({
        success: false,
        message: "The library assistant isn't available right now.",
      });
    }

    // Chat memory is keyed by the logged-in user AND the browser's threadId,
    // so one student can never read or continue another student's thread
    // (e.g. a reused browser tab after logout, or a copied threadId).
    // Guests have no user id, so each guest session uses its own guestId.
    const owner = req.user.isGuest ? `guest-${req.user.guestId}` : req.user.id;
    const cacheKey = `${owner}:${threadId.trim()}`;
    const answer = await askLibraryAssistant(input, cacheKey);

    return res.status(200).json({
      success: true,
      ai: answer,
    });
  } catch (error) {
    // Full detail (which can include raw model output) stays in server logs only
    console.error("Smart search error:", error);

    return res.status(500).json({
      success: false,
      message: "Smart search failed. Please try again.",
    });
  }
};

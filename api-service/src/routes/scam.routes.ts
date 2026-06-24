import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { detectScam } from "../services/scam.service";
import { scamDetectionLimiter } from "../middleware/rateLimit.middleware";
import { verifyToken } from "../middleware/auth.middleware";
import {
  ScamDetectionRequest,
  ScamDetectionResponse,
} from "../types/scam.types";

const router = Router();

// ─── POST /api/v1/scam/detect ───────────────────────────────
// Main scam detection endpoint
// Called by citizen portal when user pastes suspicious message
router.post(
  "/detect",
  verifyToken, // Check if user has JWT token
  scamDetectionLimiter, // Max 20 requests per 15 minutes
  async (
    req: Request<{}, {}, ScamDetectionRequest>,
    res: Response<
      ScamDetectionResponse | { success: boolean; message: string }
    >,
  ) => {
    try {
      // ─── Validate Request Body ───────────────────────
      const { message, location } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          message: "Message is required",
        });
        return;
      }

      if (message.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: "Message too short. Please provide more context.",
        });
        return;
      }

      if (message.length > 5000) {
        res.status(400).json({
          success: false,
          message: "Message too long. Maximum 5000 characters.",
        });
        return;
      }

      logger.info(`📨 Scam detection request received`, {
        userId: req.user?.userId,
        messageLength: message.length,
        location,
      });

      // ─── Call Scam Service ───────────────────────────
      const result = await detectScam({
        message: message.trim(),
        location,
        userId: req.user?.userId,
      });

      // ─── Return Result ───────────────────────────────
      res.status(200).json(result);
    } catch (error) {
      logger.error("❌ Scam detection route error:", { error });
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  },
);

// ─── GET /api/v1/scam/report/:reportId ──────────────────────
// Get a specific scam report by ID
// Used by citizen to download their evidence report
router.get(
  "/report/:reportId",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const { reportId } = req.params;

      if (!reportId) {
        res.status(400).json({
          success: false,
          message: "Report ID is required",
        });
        return;
      }

      // Import here to avoid circular dependency
      const { EvidenceModel } = await import("../models/evidence.model");

      const evidence = await EvidenceModel.findOne({ reportId });

      if (!evidence) {
        res.status(404).json({
          success: false,
          message: "Report not found",
        });
        return;
      }

      logger.info(`✅ Evidence report fetched: ${reportId}`);
      res.status(200).json(evidence);
    } catch (error) {
      logger.error("❌ Get report route error:", { error });
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

export default router;

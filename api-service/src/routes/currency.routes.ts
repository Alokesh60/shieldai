import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import {
  detectCurrency,
  formatCurrencyResult,
} from "../services/currency.service";
import { currencyDetectionLimiter } from "../middleware/rateLimit.middleware";
import { verifyToken } from "../middleware/auth.middleware";
import {
  CurrencyDetectionRequest,
  CurrencyDetectionResponse,
} from "../types/currency.types";

const router = Router();

// ─── POST /api/v1/currency/detect ───────────────────────────
// Main currency detection endpoint
// Called by citizen portal when user uploads note photo
router.post(
  "/detect",
  verifyToken,
  currencyDetectionLimiter,
  async (
    req: Request<{}, {}, CurrencyDetectionRequest>,
    res: Response<
      CurrencyDetectionResponse | { success: boolean; message: string }
    >,
  ) => {
    try {
      // ─── Validate Request Body ───────────────────────
      const { image, denomination } = req.body;

      if (!image) {
        res.status(400).json({
          success: false,
          message: "Image is required",
        });
        return;
      }

      // ─── Check Image Size ────────────────────────────
      // Base64 image should not exceed 5MB
      // 5MB = 5 * 1024 * 1024 bytes
      // Base64 adds ~33% overhead so actual limit is ~3.75MB
      const imageSizeBytes = Buffer.byteLength(image, "base64");
      const maxSizeBytes = 5 * 1024 * 1024;

      if (imageSizeBytes > maxSizeBytes) {
        res.status(400).json({
          success: false,
          message: "Image too large. Maximum size is 5MB.",
        });
        return;
      }

      logger.info(`📸 Currency detection request received`, {
        userId: req.user?.userId,
        denomination,
        imageSizeKB: Math.round(imageSizeBytes / 1024),
      });

      // ─── Call Currency Service ───────────────────────
      const result = await detectCurrency({ image, denomination });

      // ─── Format and Return Result ────────────────────
      const formattedResult = formatCurrencyResult(result);
      res.status(200).json(formattedResult);
    } catch (error) {
      const err = error as Error;
      logger.error("❌ Currency detection route error:", {
        message: err.message,
      });

      // ─── Handle Validation Errors ────────────────────
      // These come from currency service validation
      if (err.message.includes("Invalid") || err.message.includes("required")) {
        res.status(400).json({
          success: false,
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Currency detection failed. Please try again.",
      });
    }
  },
);

// ─── GET /api/v1/currency/denominations ─────────────────────
// Returns list of supported denominations
// Frontend uses this to show denomination selector
router.get("/denominations", async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    denominations: [
      { value: 10, label: "₹10", color: "#8B4513" },
      { value: 20, label: "₹20", color: "#FF6B35" },
      { value: 50, label: "₹50", color: "#9B59B6" },
      { value: 100, label: "₹100", color: "#27AE60" },
      { value: 200, label: "₹200", color: "#F39C12" },
      { value: 500, label: "₹500", color: "#2980B9" },
      { value: 2000, label: "₹2000", color: "#E91E63" },
    ],
  });
});

export default router;

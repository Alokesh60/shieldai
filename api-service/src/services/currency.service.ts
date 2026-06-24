import { logger } from "../config/logger";
import { analyseCurrency } from "./agentClient.service";
import {
  CurrencyDetectionRequest,
  CurrencyDetectionResponse,
} from "../types/currency.types";

// ─── Detect Currency ────────────────────────────────────────
// Main function called by currency route
// Validates request then calls ML service
export const detectCurrency = async (
  request: CurrencyDetectionRequest,
): Promise<CurrencyDetectionResponse> => {
  logger.info("🔄 Starting currency detection flow");

  // ─── Step 1: Validate Image ─────────────────────────────
  if (!request.image) {
    throw new Error("Image is required for currency detection");
  }

  // ─── Step 2: Validate Base64 Format ────────────────────
  const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
  const isValidBase64 =
    base64Regex.test(request.image) || isValidBase64String(request.image);

  if (!isValidBase64) {
    throw new Error(
      "Invalid image format. Please provide a valid base64 image.",
    );
  }

  // ─── Step 3: Validate Denomination ─────────────────────
  const validDenominations = [10, 20, 50, 100, 200, 500, 2000];
  if (
    request.denomination &&
    !validDenominations.includes(request.denomination)
  ) {
    throw new Error(
      `Invalid denomination. Valid values: ${validDenominations.join(", ")}`,
    );
  }

  // ─── Step 4: Call ML Service ────────────────────────────
  const result = (await analyseCurrency(
    request.image,
    request.denomination,
  )) as CurrencyDetectionResponse;

  logger.info(`✅ Currency detection completed: ${result.verdict}`);
  return result;
};

// ─── Validate Base64 String ─────────────────────────────────
// Checks if string is valid base64 without data URI prefix
const isValidBase64String = (str: string): boolean => {
  try {
    // Remove data URI prefix if present
    const base64 = str.includes(",") ? str.split(",")[1] : str;
    // Try to decode — if it fails, not valid base64
    return Buffer.from(base64, "base64").toString("base64") === base64;
  } catch {
    return false;
  }
};

// ─── Format Currency Result ─────────────────────────────────
// Formats ML service response into clean response
export const formatCurrencyResult = (
  result: CurrencyDetectionResponse,
): CurrencyDetectionResponse => {
  return {
    verdict: result.verdict,
    confidence: Math.round(result.confidence * 100) / 100,
    denomination: result.denomination,
    issuesFound: result.issuesFound || [],
    securityFeatures: result.securityFeatures || [],
  };
};

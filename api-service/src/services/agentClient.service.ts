import axios, { AxiosError } from "axios";
import { agentServiceBreaker } from "../middleware/circuitBreaker.middleware";
import { getCache, setCache } from "../config/redis";
import { logger } from "../config/logger";
import {
  ScamDetectionRequest,
  ScamDetectionResponse,
  AgentServiceRequest,
} from "../types/scam.types";
import crypto from "crypto";

// ─── Cache TTL ──────────────────────────────────────────────
// How long to cache scam detection results
const CACHE_TTL = 3600; // 1 hour in seconds

// ─── Generate Cache Key ─────────────────────────────────────
// Hash the message so similar messages get same cache key
// We don't store raw message as key for privacy
const generateCacheKey = (message: string): string => {
  const hash = crypto
    .createHash("sha256")
    .update(message.toLowerCase().trim())
    .digest("hex");
  return `scam:${hash}`;
};

// ─── Call Agent Service ─────────────────────────────────────
// This is the main function that talks to Python agent service
export const analyseScamMessage = async (
  request: ScamDetectionRequest,
): Promise<ScamDetectionResponse> => {
  const { message, location } = request;

  // ─── Step 1: Check Cache ───────────────────────────────
  const cacheKey = generateCacheKey(message);
  const cachedResult = await getCache<ScamDetectionResponse>(cacheKey);

  if (cachedResult) {
    logger.info(`✅ Cache hit for scam detection`);
    return cachedResult;
  }

  // ─── Step 2: Call Agent Service via Circuit Breaker ────
  logger.info(`🔄 Calling agent service for scam detection`);

  try {
    const agentRequest: AgentServiceRequest = {
      message,
      location,
    };

    const result = (await agentServiceBreaker.fire(
      agentRequest,
    )) as ScamDetectionResponse;

    // ─── Step 3: Cache Result ──────────────────────────
    // Only cache definitive results, not uncertain ones
    if (result.confidence > 70) {
      await setCache(cacheKey, result, CACHE_TTL);
      logger.info(`✅ Result cached for future requests`);
    }

    return result;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error("❌ Agent service call failed:", {
      message: axiosError.message,
      status: axiosError.response?.status,
    });

    // ─── Fallback Response ─────────────────────────────
    // Circuit breaker fallback already handles this
    // But just in case, return safe default
    return {
      verdict: "SUSPICIOUS",
      confidence: 0,
      scamType: "UNKNOWN",
      reasoning: "Analysis temporarily unavailable. Please be cautious.",
      evidenceReport: {
        reportId: crypto.randomUUID(),
        timestamp: new Date(),
        scamType: "UNKNOWN",
        confidence: 0,
        patternMatched: "UNKNOWN",
        historicalPrecedents: [],
        recommendedAction:
          "Please verify manually and report to cybercrime.gov.in",
        legalReference: "N/A",
        evidenceChain: [],
      },
    };
  }
};

// ─── Call ML Service for Currency Detection ─────────────────
export const analyseCurrency = async (
  image: string,
  denomination?: number,
): Promise<unknown> => {
  // ─── Check Cache ───────────────────────────────────────
  const imageHash = crypto.createHash("sha256").update(image).digest("hex");
  const cacheKey = `currency:${imageHash}`;

  const cachedResult = await getCache(cacheKey);
  if (cachedResult) {
    logger.info(`✅ Cache hit for currency detection`);
    return cachedResult;
  }

  // ─── Call ML Service ───────────────────────────────────
  try {
    const response = await axios.post(
      `${process.env.ML_SERVICE_URL}/detect-currency`,
      { image, denomination },
      { timeout: 10000 },
    );

    // Cache result for 24 hours
    // Currency detection results don't change
    await setCache(cacheKey, response.data, 86400);

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error("❌ ML service call failed:", {
      message: axiosError.message,
    });
    throw error;
  }
};

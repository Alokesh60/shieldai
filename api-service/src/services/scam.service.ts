import { v4 as uuidv4 } from "uuid";
import { logger } from "../config/logger";
import { ReportModel } from "../models/report.model";
import { EvidenceModel } from "../models/evidence.model";
import { publishEvent } from "../config/redis";
import { analyseScamMessage } from "./agentClient.service";
import {
  ScamDetectionRequest,
  ScamDetectionResponse,
} from "../types/scam.types";
import { FraudReport, FraudStats } from "../types/evidence.types";

// ─── Fraud Alert Channel ────────────────────────────────────
const FRAUD_ALERT_CHANNEL = "fraud-alerts";

// ─── Detect Scam ────────────────────────────────────────────
// Main function called by route
// Orchestrates entire scam detection flow
export const detectScam = async (
  request: ScamDetectionRequest,
): Promise<ScamDetectionResponse> => {
  logger.info("🔄 Starting scam detection flow");

  // ─── Step 1: Call Agent Service ────────────────────────
  const result = await analyseScamMessage(request);

  // ─── Step 2: Save to MongoDB if scam detected ──────────
  if (result.verdict !== "SAFE") {
    await saveScamReport(request, result);
  }

  logger.info(`✅ Scam detection completed: ${result.verdict}`);
  return result;
};

// ─── Save Scam Report ───────────────────────────────────────
// Saves fraud report + evidence report to MongoDB
// Publishes real time alert to dashboard
const saveScamReport = async (
  request: ScamDetectionRequest,
  result: ScamDetectionResponse,
): Promise<void> => {
  try {
    const reportId = uuidv4();

    // ─── Save Fraud Report ─────────────────────────────
    const report = new ReportModel({
      reportId,
      userId: request.userId || "anonymous",
      fraudType: mapScamTypeToFraudType(result.scamType),
      description: request.message,
      location: {
        state: request.location || "Unknown",
      },
      status: "PENDING",
    });
    await report.save();
    logger.info(`✅ Fraud report saved: ${reportId}`);

    // ─── Save Evidence Report ──────────────────────────
    if (result.evidenceReport) {
      const evidence = new EvidenceModel({
        ...result.evidenceReport,
        reportId,
      });
      await evidence.save();
      logger.info(`✅ Evidence report saved: ${reportId}`);
    }

    // ─── Publish Real Time Alert ───────────────────────
    await publishEvent(FRAUD_ALERT_CHANNEL, {
      reportId,
      verdict: result.verdict,
      scamType: result.scamType,
      confidence: result.confidence,
      location: request.location || "Unknown",
      timestamp: new Date(),
    });
    logger.info(`✅ Real time alert published: ${reportId}`);
  } catch (error) {
    logger.error("❌ Failed to save scam report:", { error });
    // Don't throw — detection result already computed
    // Saving failure shouldn't affect user response
  }
};

// ─── Map Scam Type to Fraud Type ────────────────────────────
// Converts agent service scam type to our MongoDB enum
const mapScamTypeToFraudType = (scamType: string): string => {
  const mapping: Record<string, string> = {
    DIGITAL_ARREST: "DIGITAL_ARREST",
    KYC_EXPIRY: "KYC_EXPIRY",
    LOTTERY: "LOTTERY",
    UPI_FRAUD: "UPI_FRAUD",
    INVESTMENT: "INVESTMENT",
    ROMANCE: "ROMANCE",
  };
  return mapping[scamType] || "OTHER";
};

// ─── Get Fraud Stats ────────────────────────────────────────
// Used by law enforcement dashboard
export const getFraudStats = async (): Promise<FraudStats> => {
  try {
    // Total reports
    const totalReports = await ReportModel.countDocuments();

    // Group by state
    const byStateResult = await ReportModel.aggregate([
      {
        $group: {
          _id: "$location.state",
          count: { $sum: 1 },
        },
      },
    ]);
    const byState = byStateResult.reduce(
      (acc: Record<string, number>, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      },
      {},
    );

    // Group by fraud type
    const byTypeResult = await ReportModel.aggregate([
      {
        $group: {
          _id: "$fraudType",
          count: { $sum: 1 },
        },
      },
    ]);
    const byType = byTypeResult.reduce((acc: Record<string, number>, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Daily trend for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendResult = await ReportModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const trend = trendResult.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    logger.info("✅ Fraud stats fetched successfully");

    return {
      totalReports,
      byState,
      byType: byType as never,
      trend,
    };
  } catch (error) {
    logger.error("❌ Failed to fetch fraud stats:", { error });
    throw error;
  }
};

// ─── Get All Reports ────────────────────────────────────────
// Used by law enforcement dashboard
export const getAllReports = async (
  page: number = 1,
  limit: number = 10,
): Promise<{ reports: FraudReport[]; total: number }> => {
  try {
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      ReportModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ReportModel.countDocuments(),
    ]);

    return {
      reports: reports as unknown as FraudReport[],
      total,
    };
  } catch (error) {
    logger.error("❌ Failed to fetch reports:", { error });
    throw error;
  }
};

import { Queue, Worker, Job } from "bullmq";
import { getRedisClient } from "../config/redis";
import { logger } from "../config/logger";
import {
  ScamDetectionRequest,
  ScamDetectionResponse,
} from "../types/scam.types";
import { agentServiceBreaker } from "../middleware/circuitBreaker.middleware";
import { publishEvent } from "../config/redis";
import { ReportModel } from "../models/report.model";
import { EvidenceModel } from "../models/evidence.model";
import { v4 as uuidv4 } from "uuid";

// ─── Queue Names ────────────────────────────────────────────
export const SCAM_DETECTION_QUEUE = "scam-detection";
export const FRAUD_ALERT_CHANNEL = "fraud-alerts";

// ─── Create Queue ───────────────────────────────────────────
// Queue stores jobs in Redis
// Jobs are picked up by workers asynchronously
let scamDetectionQueue: Queue;

export const getScamQueue = (): Queue => {
  if (!scamDetectionQueue) {
    scamDetectionQueue = new Queue(SCAM_DETECTION_QUEUE, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
          type: "exponential",
          delay: 1000, // Wait 1s, 2s, 4s between retries
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      },
    });
    logger.info("✅ Scam detection queue initialized");
  }
  return scamDetectionQueue;
};

// ─── Add Job to Queue ───────────────────────────────────────
export const addScamDetectionJob = async (
  data: ScamDetectionRequest,
): Promise<string> => {
  const queue = getScamQueue();
  const jobId = uuidv4();

  await queue.add("detect-scam", { ...data, jobId }, { jobId });

  logger.info(`✅ Scam detection job added to queue: ${jobId}`);
  return jobId;
};

// ─── Worker ─────────────────────────────────────────────────
// Worker runs in background, picks up jobs from queue
// Processes them one by one (or concurrently)
export const startScamWorker = (): Worker => {
  const worker = new Worker(
    SCAM_DETECTION_QUEUE,
    async (job: Job) => {
      logger.info(`🔄 Processing scam detection job: ${job.id}`);

      const { message, location, userId, jobId } = job.data;

      try {
        // ─── Call Agent Service via Circuit Breaker ──────
        const result = (await agentServiceBreaker.fire({
          message,
          location,
        })) as ScamDetectionResponse;

        // ─── Save Report to MongoDB ──────────────────────
        if (result.verdict !== "SAFE") {
          const report = new ReportModel({
            reportId: jobId,
            userId: userId || "anonymous",
            fraudType: result.scamType || "OTHER",
            description: message,
            location: {
              state: location || "Unknown",
            },
            status: "PENDING",
          });
          await report.save();

          // ─── Save Evidence Report ────────────────────
          if (result.evidenceReport) {
            const evidence = new EvidenceModel({
              ...result.evidenceReport,
              reportId: jobId,
            });
            await evidence.save();
          }

          // ─── Publish Real Time Alert ─────────────────
          // Dashboard receives this instantly via Socket.io
          await publishEvent(FRAUD_ALERT_CHANNEL, {
            reportId: jobId,
            verdict: result.verdict,
            scamType: result.scamType,
            location: location || "Unknown",
            timestamp: new Date(),
          });

          logger.info(`✅ Fraud report saved and alert published: ${jobId}`);
        }

        return result;
      } catch (error) {
        logger.error(`❌ Scam detection job failed: ${job.id}`, { error });
        throw error; // BullMQ will retry automatically
      }
    },
    {
      connection: getRedisClient(),
      concurrency: 5, // Process 5 jobs simultaneously
    },
  );

  // ─── Worker Event Listeners ─────────────────────────────
  worker.on("completed", (job: Job) => {
    logger.info(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job: Job | undefined, error: Error) => {
    logger.error(`❌ Job failed: ${job?.id}`, { error: error.message });
  });

  worker.on("stalled", (jobId: string) => {
    logger.warn(`⚠️ Job stalled: ${jobId}`);
  });

  logger.info("✅ Scam detection worker started");
  return worker;
};

import winston from "winston";

// ─── Log Levels ────────────────────────────────────────────
// error: 0 → System crashes, critical failures
// warn:  1 → Something wrong but system still works
// info:  2 → Normal operations (server started, request received)
// debug: 3 → Detailed info for development

const logFormat = winston.format.combine(
  // Add timestamp to every log
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  // Add colors in development
  winston.format.colorize(),
  // Format: [2026-06-23 17:47:44] INFO: Server started on port 3000
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }),
);

export const logger = winston.createLogger({
  // In production show only errors and warnings
  // In development show everything
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",

  format: logFormat,

  transports: [
    // ─── Console Transport ──────────────────────────────
    // Always log to console
    new winston.transports.Console(),

    // ─── File Transport (Errors) ────────────────────────
    // Save all errors to a file permanently
    // Critical for distributed systems — need audit trail
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB max file size
      maxFiles: 5, // Keep last 5 log files
    }),

    // ─── File Transport (All logs) ──────────────────────
    // Save everything to combined log
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// ─── Log Unhandled Errors ───────────────────────────────────
// Catch any uncaught errors and log them before crash
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled Promise Rejection:", { reason });
  process.exit(1);
});

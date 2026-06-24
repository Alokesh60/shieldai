import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { connectDB } from "./config/db";
import { connectRedis, getRedisClient } from "./config/redis";
import { logger } from "./config/logger";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { startScamWorker } from "./queues/scam.queue";

// ─── Import Routes ──────────────────────────────────────────
import scamRoutes from "./routes/scam.routes";
import currencyRoutes from "./routes/currency.routes";
import fraudRoutes from "./routes/fraud.routes";

// ─── Load Environment Variables ─────────────────────────────
dotenv.config();

// ─── Create Express App ─────────────────────────────────────
const app: Application = express();
const httpServer = createServer(app);

// ─── Socket.io Setup ────────────────────────────────────────
// Real time communication with frontend dashboard
const io = new SocketServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ─── Middleware ──────────────────────────────────────────────
// helmet → adds security headers
// cors   → allows frontend to call API
// json   → parse JSON request bodies
// limit  → max request size 10MB (for base64 images)
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(generalLimiter);

// ─── Request Logger ──────────────────────────────────────────
// Logs every incoming request
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`📨 ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/v1/scam", scamRoutes);
app.use("/api/v1/currency", currencyRoutes);
app.use("/api/v1/fraud", fraudRoutes);

// ─── Root Route ───────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "🛡️ ShieldAI API Service Running",
    version: "1.0.0",
    endpoints: {
      scam: "/api/v1/scam",
      currency: "/api/v1/currency",
      fraud: "/api/v1/fraud",
      health: "/api/v1/fraud/health",
    },
  });
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ─── Global Error Handler ─────────────────────────────────────
// Catches any unhandled errors in routes
// Prevents server from crashing on unexpected errors
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("❌ Unhandled error:", {
    message: error.message,
    stack: error.stack,
  });
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ─── Socket.io Connection ─────────────────────────────────────
// Handles real time dashboard connections
io.on("connection", (socket) => {
  logger.info(`🔌 Dashboard connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`🔌 Dashboard disconnected: ${socket.id}`);
  });
});

// ─── Redis Pub/Sub Subscriber ────────────────────────────────
// Listens for fraud alerts published by scam service
// Forwards them to connected dashboards via Socket.io
const setupPubSubSubscriber = async (): Promise<void> => {
  // Need separate client for subscription
  // Redis doesn't allow pub/sub + commands on same client
  const subscriber = getRedisClient().duplicate();
  await subscriber.connect();

  await subscriber.subscribe("fraud-alerts", (message) => {
    const alert = JSON.parse(message);
    logger.info(`📡 Fraud alert received, broadcasting to dashboard`);
    // Broadcast to ALL connected dashboard clients
    io.emit("fraud-alert", alert);
  });

  logger.info("✅ Redis Pub/Sub subscriber ready");
};

// ─── Start Server ─────────────────────────────────────────────
const startServer = async (): Promise<void> => {
  try {
    // ─── Connect to Databases ──────────────────────────
    await connectDB();
    await connectRedis();

    // ─── Start Background Worker ───────────────────────
    startScamWorker();

    // ─── Setup Pub/Sub ─────────────────────────────────
    await setupPubSubSubscriber();

    // ─── Start HTTP Server ─────────────────────────────
    const PORT = process.env.API_PORT || 3000;
    httpServer.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════╗
║   🛡️  ShieldAI API Service Started    ║
║   Port: ${PORT}                          ║
║   Environment: ${process.env.NODE_ENV}         ║
╚═══════════════════════════════════════╝
      `);
    });

    // ─── Graceful Shutdown ──────────────────────────────
    // When server stops (Ctrl+C or Docker stop)
    // Close all connections cleanly
    process.on("SIGTERM", async () => {
      logger.info("⚠️ SIGTERM received. Shutting down gracefully...");
      httpServer.close(async () => {
        const { disconnectDB } = await import("./config/db");
        const { disconnectRedis } = await import("./config/redis");
        await disconnectDB();
        await disconnectRedis();
        logger.info("✅ Server shut down gracefully");
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", { error });
    process.exit(1);
  }
};

// ─── Run Server ───────────────────────────────────────────────
startServer();

export { app, io };

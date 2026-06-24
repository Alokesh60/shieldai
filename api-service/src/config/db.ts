import mongoose from "mongoose";
import { logger } from "./logger";

// ─── MongoDB Connection Options ─────────────────────────────
const mongoOptions = {
  maxPoolSize: 10, // Maximum 10 concurrent connections
  serverSelectionTimeoutMS: 5000, // Timeout after 5s if can't connect
  socketTimeoutMS: 45000, // Close socket after 45s inactivity
};

// ─── Connect to MongoDB ─────────────────────────────────────
export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/shieldai";

    await mongoose.connect(mongoURI, mongoOptions);

    logger.info("✅ MongoDB connected successfully");

    // ─── Connection Event Listeners ─────────────────────
    mongoose.connection.on("disconnected", () => {
      logger.warn("⚠️ MongoDB disconnected. Attempting reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("✅ MongoDB reconnected successfully");
    });

    mongoose.connection.on("error", (error) => {
      logger.error("❌ MongoDB connection error:", { error });
    });
  } catch (error) {
    logger.error("❌ MongoDB initial connection failed:", { error });
    // Exit process if can't connect to database
    // No point running without database
    process.exit(1);
  }
};

// ─── Disconnect from MongoDB ────────────────────────────────
// Used for graceful shutdown
export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info("✅ MongoDB disconnected gracefully");
  } catch (error) {
    logger.error("❌ MongoDB disconnect error:", { error });
  }
};

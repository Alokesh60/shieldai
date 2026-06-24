import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

// ─── Redis Client Instance ──────────────────────────────────
let redisClient: RedisClientType;

// ─── Connect to Redis ───────────────────────────────────────
export const connectRedis = async (): Promise<RedisClientType> => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        reconnectStrategy: (retries: number) => {
          // Retry connection with exponential backoff
          // Retry 1 → wait 100ms
          // Retry 2 → wait 200ms
          // Retry 3 → wait 400ms
          // Max wait → 3000ms
          const delay = Math.min(retries * 100, 3000);
          logger.warn(
            `⚠️ Redis reconnecting... attempt ${retries}, waiting ${delay}ms`,
          );
          return delay;
        },
      },
    }) as RedisClientType;

    // ─── Redis Event Listeners ──────────────────────────
    redisClient.on("connect", () => {
      logger.info("✅ Redis connected successfully");
    });

    redisClient.on("error", (error) => {
      logger.error("❌ Redis connection error:", { error });
    });

    redisClient.on("reconnecting", () => {
      logger.warn("⚠️ Redis reconnecting...");
    });

    redisClient.on("end", () => {
      logger.warn("⚠️ Redis connection closed");
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error("❌ Redis initial connection failed:", { error });
    process.exit(1);
  }
};

// ─── Get Redis Client ───────────────────────────────────────
// Used by other files to get the redis client instance
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error("Redis not initialized. Call connectRedis() first.");
  }
  return redisClient;
};

// ─── Cache Helper Functions ─────────────────────────────────

// Save data to cache with expiry time
export const setCache = async (
  key: string,
  value: unknown,
  expirySeconds: number = 3600, // Default 1 hour
): Promise<void> => {
  try {
    await redisClient.setEx(key, expirySeconds, JSON.stringify(value));
    logger.debug(`✅ Cache set: ${key} (expires in ${expirySeconds}s)`);
  } catch (error) {
    logger.error("❌ Cache set error:", { key, error });
  }
};

// Get data from cache
export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redisClient.get(key);
    if (!data) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }
    logger.debug(`Cache hit: ${key}`);
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error("❌ Cache get error:", { key, error });
    return null;
  }
};

// Delete from cache
export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
    logger.debug(`✅ Cache deleted: ${key}`);
  } catch (error) {
    logger.error("❌ Cache delete error:", { key, error });
  }
};

// ─── Pub/Sub Publisher ──────────────────────────────────────
// Publishes fraud alert events to dashboard in real time
export const publishEvent = async (
  channel: string,
  data: unknown,
): Promise<void> => {
  try {
    await redisClient.publish(channel, JSON.stringify(data));
    logger.debug(`✅ Event published to channel: ${channel}`);
  } catch (error) {
    logger.error("❌ Publish event error:", { channel, error });
  }
};

// ─── Disconnect Redis ───────────────────────────────────────
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redisClient.quit();
    logger.info("✅ Redis disconnected gracefully");
  } catch (error) {
    logger.error("❌ Redis disconnect error:", { error });
  }
};

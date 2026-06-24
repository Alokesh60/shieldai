import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

// ─── General API Rate Limiter ───────────────────────────────
// Applies to all routes
// Max 100 requests per 15 minutes per IP
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Scam Detection Rate Limiter ───────────────────────────
// Stricter limit for AI endpoints (expensive operations)
// Max 20 requests per 15 minutes per IP
export const scamDetectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many scam detection requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator — rate limit by IP + userId
  keyGenerator: (req: Request): string => {
    return `${req.ip}_${req.user?.userId || "anonymous"}`;
  },
});

// ─── Currency Detection Rate Limiter ───────────────────────
// Max 30 requests per 15 minutes per IP
export const currencyDetectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many currency detection requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Law Enforcement Dashboard Limiter ─────────────────────
// More relaxed for verified law enforcement users
// Max 500 requests per 15 minutes
export const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: "Rate limit exceeded. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

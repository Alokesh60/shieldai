import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ─── Extend Express Request type ───────────────────────────
// This adds a 'user' field to every request object
// So after auth middleware runs, any route can access req.user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: "CITIZEN" | "LAW_ENFORCEMENT" | "ADMIN";
      };
    }
  }
}

// ─── Verify JWT Token ───────────────────────────────────────
export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // Get token from Authorization header
    // Header format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token — allow as anonymous citizen user
      req.user = {
        userId: "anonymous",
        role: "CITIZEN",
      };
      next();
      return;
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.split(" ")[1];

    // Verify token using JWT secret
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret",
    ) as {
      userId: string;
      role: "CITIZEN" | "LAW_ENFORCEMENT" | "ADMIN";
    };

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    // Invalid token — treat as anonymous
    req.user = {
      userId: "anonymous",
      role: "CITIZEN",
    };
    next();
  }
};

// ─── Require Law Enforcement Role ──────────────────────────
// Used to protect dashboard routes
// Only police/law enforcement can access dashboard APIs
export const requireLawEnforcement = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== "LAW_ENFORCEMENT" && req.user?.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Access denied. Law enforcement only.",
    });
    return;
  }
  next();
};

// ─── Require Admin Role ─────────────────────────────────────
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Access denied. Admins only.",
    });
    return;
  }
  next();
};

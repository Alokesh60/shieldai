import CircuitBreaker from "opossum";
import axios from "axios";
import { logger } from "../config/logger";

// ─── Circuit Breaker Options ────────────────────────────────
const breakerOptions = {
  timeout: 10000, // If request takes longer than 10s → fail
  errorThresholdPercentage: 50, // If 50% requests fail → open circuit
  resetTimeout: 30000, // After 30s → try again (half-open state)
  volumeThreshold: 5, // Minimum 5 requests before tripping
};

// ─── What is a Circuit Breaker? ────────────────────────────
// 3 states:
// CLOSED  → Everything working, requests flow normally
// OPEN    → Too many failures, requests blocked immediately
// HALF-OPEN → Testing if service recovered, allow one request

// ─── Agent Service Circuit Breaker ─────────────────────────
// Protects calls to Python agent service (LangChain + Gemini)
const callAgentService = async (data: object): Promise<unknown> => {
  const response = await axios.post(
    `${process.env.AGENT_SERVICE_URL}/analyse`,
    data,
    { timeout: 10000 },
  );
  return response.data;
};

export const agentServiceBreaker = new CircuitBreaker(
  callAgentService,
  breakerOptions,
);

// ─── Fallback when Agent Service is down ───────────────────
// Instead of crashing, return a safe default response
agentServiceBreaker.fallback(() => ({
  verdict: "SUSPICIOUS",
  confidence: 0,
  scamType: "UNKNOWN",
  reasoning:
    "AI analysis temporarily unavailable. Please treat this message with caution and verify manually.",
  evidenceReport: null,
}));

// ─── ML Service Circuit Breaker ────────────────────────────
// Protects calls to Python ML service (PyTorch models)
const callMLService = async (
  endpoint: string,
  data: object,
): Promise<unknown> => {
  const response = await axios.post(
    `${process.env.ML_SERVICE_URL}${endpoint}`,
    data,
    { timeout: 10000 },
  );
  return response.data;
};

export const mlServiceBreaker = new CircuitBreaker(
  callMLService,
  breakerOptions,
);

// ─── Fallback when ML Service is down ──────────────────────
mlServiceBreaker.fallback(() => ({
  verdict: "UNCERTAIN",
  confidence: 0,
  issuesFound: [],
  reasoning:
    "Currency analysis temporarily unavailable. Please verify manually at your nearest bank.",
}));

// ─── Circuit Breaker Event Listeners ───────────────────────
// Log every state change for monitoring

agentServiceBreaker.on("open", () => {
  logger.error("🔴 Agent Service Circuit OPEN — too many failures");
});

agentServiceBreaker.on("halfOpen", () => {
  logger.warn("🟡 Agent Service Circuit HALF-OPEN — testing recovery");
});

agentServiceBreaker.on("close", () => {
  logger.info("🟢 Agent Service Circuit CLOSED — service recovered");
});

mlServiceBreaker.on("open", () => {
  logger.error("🔴 ML Service Circuit OPEN — too many failures");
});

mlServiceBreaker.on("halfOpen", () => {
  logger.warn("🟡 ML Service Circuit HALF-OPEN — testing recovery");
});

mlServiceBreaker.on("close", () => {
  logger.info("🟢 ML Service Circuit CLOSED — service recovered");
});

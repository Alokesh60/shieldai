export type Verdict = "SCAM" | "SUSPICIOUS" | "SAFE";

export interface ScamDetectionRequest {
  message: string;
  location?: string;
  userId?: string;
}

export interface EvidenceReport {
  reportId: string;
  timestamp: Date;
  scamType: string;
  confidence: number;
  patternMatched: string;
  historicalPrecedents: string[];
  recommendedAction: string;
  legalReference: string;
  evidenceChain: string[];
}

export interface ScamDetectionResponse {
  verdict: Verdict;
  confidence: number;
  scamType: string;
  reasoning: string;
  evidenceReport: EvidenceReport;
}

export interface AgentServiceRequest {
  message: string;
  location?: string;
}

export interface AgentServiceResponse {
  verdict: Verdict;
  confidence: number;
  scamType: string;
  reasoning: string;
  evidenceReport: EvidenceReport;
}

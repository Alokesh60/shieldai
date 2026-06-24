export type ReportStatus = "PENDING" | "VERIFIED" | "DISMISSED";

export type FraudType =
  | "DIGITAL_ARREST"
  | "KYC_EXPIRY"
  | "LOTTERY"
  | "UPI_FRAUD"
  | "FAKE_CURRENCY"
  | "INVESTMENT"
  | "ROMANCE"
  | "OTHER";

export interface FraudReport {
  reportId: string;
  userId?: string;
  fraudType: FraudType;
  description: string;
  location: FraudLocation;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  evidenceReport?: LegalEvidence;
}

export interface FraudLocation {
  state: string;
  city?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface LegalEvidence {
  reportId: string;
  timestamp: Date;
  fraudType: FraudType;
  confidence: number;
  patternMatched: string;
  historicalPrecedents: string[];
  recommendedAction: string;
  legalReference: string;
  evidenceChain: string[];
  submittedTo?: string;
}

export interface FraudMapHotspot {
  state: string;
  city?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  count: number;
  fraudTypes: FraudType[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface FraudStats {
  totalReports: number;
  byState: Record<string, number>;
  byType: Record<FraudType, number>;
  trend: TrendData[];
}

export interface TrendData {
  date: string;
  count: number;
}

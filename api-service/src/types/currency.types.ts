export type CurrencyVerdict = "GENUINE" | "FAKE" | "UNCERTAIN";

export interface CurrencyDetectionRequest {
  image: string; // base64 encoded image
  denomination?: number; // 500, 2000, 100 etc
}

export interface CurrencyDetectionResponse {
  verdict: CurrencyVerdict;
  confidence: number;
  denomination: number;
  issuesFound: string[];
  securityFeatures: SecurityFeatureCheck[];
}

export interface SecurityFeatureCheck {
  feature: string;
  status: "PRESENT" | "MISSING" | "DAMAGED";
  description: string;
}

export interface MLServiceCurrencyRequest {
  image: string;
  denomination?: number;
}

export interface MLServiceCurrencyResponse {
  verdict: CurrencyVerdict;
  confidence: number;
  denomination: number;
  issuesFound: string[];
  securityFeatures: SecurityFeatureCheck[];
}

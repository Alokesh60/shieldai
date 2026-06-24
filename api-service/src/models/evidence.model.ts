import mongoose, { Document, Schema } from "mongoose";
import { FraudType } from "../types/evidence.types";

export interface IEvidence extends Document {
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

const EvidenceSchema = new Schema<IEvidence>(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    fraudType: {
      type: String,
      enum: [
        "DIGITAL_ARREST",
        "KYC_EXPIRY",
        "LOTTERY",
        "UPI_FRAUD",
        "FAKE_CURRENCY",
        "INVESTMENT",
        "ROMANCE",
        "OTHER",
      ],
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    patternMatched: {
      type: String,
      required: true,
    },
    historicalPrecedents: {
      type: [String],
      default: [],
    },
    recommendedAction: {
      type: String,
      required: true,
    },
    legalReference: {
      type: String,
      required: true,
    },
    evidenceChain: {
      type: [String],
      default: [],
    },
    submittedTo: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

export const EvidenceModel = mongoose.model<IEvidence>(
  "Evidence",
  EvidenceSchema,
);

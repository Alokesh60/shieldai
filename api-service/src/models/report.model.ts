import mongoose, { Document, Schema } from "mongoose";
import { FraudType, ReportStatus } from "../types/evidence.types";

export interface IReport extends Document {
  reportId: string;
  userId?: string;
  fraudType: FraudType;
  description: string;
  location: {
    state: string;
    city?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: false,
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
    description: {
      type: String,
      required: true,
    },
    location: {
      state: { type: String, required: true },
      city: { type: String, required: false },
      coordinates: {
        lat: { type: Number, required: false },
        lng: { type: Number, required: false },
      },
    },
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "DISMISSED"],
      default: "PENDING",
    },
  },
  {
    timestamps: true,
  },
);

export const ReportModel = mongoose.model<IReport>("Report", ReportSchema);

import mongoose from "mongoose";

export const EXCEPTION_TYPES = {
  DUPLICATE_SETTLEMENT: "DUPLICATE_SETTLEMENT",
  MISSING_SETTLEMENT: "MISSING_SETTLEMENT",
  AMOUNT_MISMATCH_BEYOND_TOLERANCE: "AMOUNT_MISMATCH_BEYOND_TOLERANCE",
  ORPHAN_RECORD: "ORPHAN_RECORD",
};

const settlementSchema = new mongoose.Schema({
  settlementId: { type: String, required: true, unique: true, index: true },
  referenceId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  settledAt: { type: Date, required: true },
  rawMeta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "settlement_records" });

const reconciliationSchema = new mongoose.Schema({
  ledgerRecordId: { type: String, default: null, index: true },
  ledgerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  settlementRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "SettlementRecord", default: null },
  matchTier: { type: String, enum: ["exact", "fuzzy", "unresolved"], required: true },
  confidence: { type: Number, min: 0, max: 1, required: true },
  reasoning: { type: String, required: true },
  exceptionType: { type: String, enum: [...Object.values(EXCEPTION_TYPES), null], default: null },
  suggestedAction: { type: String, default: null },
  status: { type: String, enum: ["pending_review", "approved", "rejected"], default: "pending_review", index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, collection: "reconciliation_results" });

reconciliationSchema.index({ ledgerRecordId: 1 }, { unique: true, sparse: true });

export const SettlementRecord = mongoose.models.SettlementRecord || mongoose.model("SettlementRecord", settlementSchema);
export const ReconciliationResult = mongoose.models.ReconciliationResult || mongoose.model("ReconciliationResult", reconciliationSchema);

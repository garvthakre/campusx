import crypto from "crypto";
import { ReconciliationResult, SettlementRecord, EXCEPTION_TYPES } from "./reconciliation.model.js";
import { readLedgerRecords } from "./ledger.adapter.js";
import logger from "../../shared/utils/logger.js";

const FEE_TOLERANCE = 20;
const SETTLEMENT_WINDOW_DAYS = 7;
const ACTIONS = {
  [EXCEPTION_TYPES.DUPLICATE_SETTLEMENT]: "Review duplicate settlement and retain only one valid record.",
  [EXCEPTION_TYPES.MISSING_SETTLEMENT]: "Contact the payment provider and request settlement details.",
  [EXCEPTION_TYPES.AMOUNT_MISMATCH_BEYOND_TOLERANCE]: "Investigate fees, refunds, or settlement adjustments.",
  [EXCEPTION_TYPES.ORPHAN_RECORD]: "Verify the external reference and link it to a valid ledger record.",
};

function dayKey(value) { return new Date(value).toISOString().slice(0, 10); }
function withinWindow(ledgerDate, settledAt) {
  const difference = new Date(settledAt).getTime() - new Date(ledgerDate).getTime();
  return difference >= 0 && difference <= SETTLEMENT_WINDOW_DAYS * 86400000;
}
function similarity(left, right) {
  if (left === right) return 0;
  const matrix = Array.from({ length: left.length + 1 }, (_, row) => [row]);
  for (let column = 0; column <= right.length; column++) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
  }
  return matrix[left.length][right.length];
}
function isCandidate(ledger, settlement) {
  const reference = String(settlement.referenceId);
  const transaction = String(ledger.transactionId);
  const referenceClose = similarity(reference, transaction) <= 2 || reference.startsWith(transaction.slice(0, 8));
  return referenceClose && withinWindow(ledger.timestamp, settlement.settledAt) && Math.abs(settlement.amount - ledger.amount) <= FEE_TOLERANCE;
}
function buildPrompt(ledger, candidates) {
  return `You are a financial reconciliation assistant. Given one internal ledger record and one or more candidate settlement records, determine if any candidate is the true match for the ledger record.\n\nInternal ledger record:\n- Transaction ID: ${ledger.transactionId}\n- Amount: ₹${ledger.amount}\n- Timestamp: ${ledger.timestamp.toISOString()}\n\nCandidate settlement record(s):\n${candidates.map((candidate) => `- settlementId: ${candidate.settlementId}, referenceId: ${candidate.referenceId}, amount: ₹${candidate.amount}, settledAt: ${new Date(candidate.settledAt).toISOString()}`).join("\\n")}\n\nConsider that settlement amounts are typically the ledger amount minus a processing fee (usually ₹1-20), and settlement typically lags the original transaction by 1-5 days.\n\nRespond ONLY with JSON in this exact shape, no prose outside the JSON:\n{"isMatch": boolean, "matchedSettlementId": string | null, "confidence": number, "reasoning": string}`;
}
async function askLLM(ledger, candidates) {
  if (process.env.SIMULATE_LLM_FAILURE === "true") throw new Error("Simulated LLM failure");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0, messages: [{ role: "user", content: buildPrompt(ledger, candidates) }] }),
  });
  if (!response.ok) throw new Error(`LLM request failed with status ${response.status}`);
  const payload = await response.json();
  const result = JSON.parse(payload.choices?.[0]?.message?.content || "");
  if (typeof result.isMatch !== "boolean" || typeof result.confidence !== "number" || typeof result.reasoning !== "string") throw new Error("Malformed LLM response");
  return result;
}

export async function generateSettlementData(limit = 300) {
  const ledger = (await readLedgerRecords()).slice(0, Math.max(1, Math.min(Number(limit) || 300, 500)));
  const summary = { clean: 0, duplicate: 0, missing: 0, amountMismatch: 0, orphan: 0 };
  const records = [];
  for (const [index, item] of ledger.entries()) {
    const bucket = index % 20;
    if (bucket >= 18) { summary.missing++; continue; }
    const settlement = {
      settlementId: `synthetic_${item.transactionId}_${crypto.randomUUID()}`,
      referenceId: item.transactionId,
      amount: bucket >= 17 ? item.amount - 100 : item.amount - (1 + (index % 15)),
      settledAt: new Date(item.timestamp.getTime() + (1 + (index % 4)) * 86400000),
      rawMeta: { generated: true, groundTruth: bucket >= 17 ? "amountMismatch" : bucket >= 16 ? "duplicate" : "clean", ledgerRecordId: item.ledgerRecordId },
    };
    records.push(settlement);
    summary[settlement.rawMeta.groundTruth]++;
    if (bucket === 16) records.push({ ...settlement, settlementId: `${settlement.settlementId}_duplicate`, settledAt: new Date(settlement.settledAt.getTime() + 3600000), rawMeta: { ...settlement.rawMeta, duplicateOf: settlement.settlementId } });
  }
  const orphanCount = Math.max(1, Math.round(ledger.length * 0.05));
  for (let index = 0; index < orphanCount; index++) {
    records.push({ settlementId: `synthetic_orphan_${crypto.randomUUID()}`, referenceId: `orphan_${crypto.randomUUID()}`, amount: 100 + index, settledAt: new Date(), rawMeta: { generated: true, groundTruth: "orphan" } });
    summary.orphan++;
  }
  if (records.length) await SettlementRecord.insertMany(records, { ordered: false });
  return { ledgerCount: ledger.length, inserted: records.length, summary };
}

function classify(ledger, allSettlements, candidates) {
  const references = allSettlements.filter((item) => item.referenceId === ledger.transactionId);
  if (references.length > 1) return EXCEPTION_TYPES.DUPLICATE_SETTLEMENT;
  if (references.length === 1 && Math.abs(references[0].amount - ledger.amount) > FEE_TOLERANCE) return EXCEPTION_TYPES.AMOUNT_MISMATCH_BEYOND_TOLERANCE;
  if (candidates.length) return EXCEPTION_TYPES.AMOUNT_MISMATCH_BEYOND_TOLERANCE;
  return EXCEPTION_TYPES.MISSING_SETTLEMENT;
}

export async function runReconciliation() {
  const ledger = await readLedgerRecords();
  const settlements = await SettlementRecord.find().lean();
  const existing = new Set((await ReconciliationResult.find({ ledgerRecordId: { $ne: null } }).select("ledgerRecordId").lean()).map((item) => item.ledgerRecordId));
  const results = [];
  for (const item of ledger) {
    if (existing.has(item.ledgerRecordId)) continue;
    const exact = settlements.filter((candidate) => candidate.referenceId === item.transactionId && candidate.amount === item.amount && dayKey(candidate.settledAt) === dayKey(item.timestamp));
    let result = exact.length === 1 ? { settlementRecordId: exact[0]._id, settlementSnapshot: exact[0], matchTier: "exact", confidence: 1, reasoning: "Exact transactionId, amount, and same-day settlement.", exceptionType: null, suggestedAction: null } : null;
    const candidates = settlements.filter((candidate) => isCandidate(item, candidate));
    if (!result && candidates.length) {
      try {
        const llm = await askLLM(item, candidates);
        if (llm.isMatch && llm.confidence >= 0.7) {
          const match = candidates.find((candidate) => candidate.settlementId === llm.matchedSettlementId);
          if (match) result = { settlementRecordId: match._id, settlementSnapshot: match, matchTier: "fuzzy", confidence: llm.confidence, reasoning: llm.reasoning, exceptionType: null, suggestedAction: null };
        }
      } catch (error) {
        logger.warn(`[RECONCILIATION]: LLM unavailable for ${item.ledgerRecordId}: ${error.message}`);
      }
    }
    if (!result) {
      const exceptionType = classify(item, settlements, candidates);
      result = { settlementRecordId: null, settlementSnapshot: null, matchTier: "unresolved", confidence: 0, reasoning: "No approved match was found by the reconciliation cascade.", exceptionType, suggestedAction: ACTIONS[exceptionType] };
    }
    results.push({ ledgerRecordId: item.ledgerRecordId, ledgerSnapshot: item, ...result });
  }
  const knownLedgerIds = new Set(ledger.map((item) => item.transactionId));
  for (const settlement of settlements.filter((item) => !knownLedgerIds.has(item.referenceId))) results.push({ ledgerRecordId: null, ledgerSnapshot: null, settlementRecordId: settlement._id, matchTier: "unresolved", confidence: 0, reasoning: "Settlement has no corresponding internal ledger record.", exceptionType: EXCEPTION_TYPES.ORPHAN_RECORD, suggestedAction: ACTIONS[EXCEPTION_TYPES.ORPHAN_RECORD] });
  if (results.length) await ReconciliationResult.insertMany(results, { ordered: false });
  return { processed: results.length };
}

export async function getMetrics() {
  const results = await ReconciliationResult.find().lean();
  const tierBreakdown = { exact: 0, fuzzy: 0, unresolved: 0 };
  const exceptionBreakdown = Object.fromEntries(Object.values(EXCEPTION_TYPES).map((type) => [type, 0]));
  for (const result of results) { tierBreakdown[result.matchTier]++; if (result.exceptionType) exceptionBreakdown[result.exceptionType]++; }
  const matched = tierBreakdown.exact + tierBreakdown.fuzzy;
  const falsePositives = results.filter((result) => result.matchTier === "fuzzy" && ["missing", "orphan"].includes(result.settlementSnapshot?.rawMeta?.groundTruth)).length;
  return { total: results.length, matchRate: results.length ? matched / results.length : 0, tierBreakdown, exceptionBreakdown, falsePositiveRate: matched ? falsePositives / matched : 0 };
}

export { ACTIONS };

import mongoose from "mongoose";
import { ReconciliationResult } from "./reconciliation.model.js";
import { generateSettlementData, getMetrics, runReconciliation } from "./reconciliation.service.js";

export async function generateData(req, res, next) { try { if (process.env.NODE_ENV === "production") return res.status(403).json({ message: "Disabled in production" }); return res.status(201).json(await generateSettlementData(req.body?.limit)); } catch (error) { next(error); } }
export async function run(req, res, next) { try { return res.json(await runReconciliation()); } catch (error) { next(error); } }
export async function listResults(req, res, next) { try { const filter = {}; if (req.query.tier) filter.matchTier = req.query.tier; if (req.query.exceptionType) filter.exceptionType = req.query.exceptionType; if (req.query.status) filter.status = req.query.status; return res.json(await ReconciliationResult.find(filter).sort({ createdAt: -1 }).lean()); } catch (error) { next(error); } }
export async function metrics(req, res, next) { try { return res.json(await getMetrics()); } catch (error) { next(error); } }
export async function toggleSimulation(req, res) { process.env.SIMULATE_LLM_FAILURE = req.body?.enabled ? "true" : "false"; return res.json({ enabled: process.env.SIMULATE_LLM_FAILURE === "true" }); }
export async function review(req, res, next) { try { if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid reconciliation ID" }); const status = req.path.endsWith("/approve") ? "approved" : "rejected"; const result = await ReconciliationResult.findOneAndUpdate({ _id: req.params.id, status: "pending_review" }, { $set: { status, reviewedBy: req.user.id, reviewedAt: new Date() } }, { new: true }).lean(); if (!result) return res.status(409).json({ message: "Result is missing or already reviewed" }); return res.json(result); } catch (error) { next(error); } }

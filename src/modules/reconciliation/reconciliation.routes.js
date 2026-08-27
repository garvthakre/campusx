import express from "express";
import { verifyAdmin, verifyToken } from "../../shared/middleware/index.js";
import { generateData, metrics, listResults, review, run, toggleSimulation } from "./reconciliation.controller.js";

const router = express.Router();
router.post("/generate-data", verifyAdmin, generateData);
router.post("/run", verifyAdmin, run);
router.post("/simulate-llm-failure", verifyAdmin, toggleSimulation);
router.get("/results", verifyToken, listResults);
router.get("/metrics", verifyToken, metrics);
router.patch("/:id/approve", verifyToken, review);
router.patch("/:id/reject", verifyToken, review);
export default router;

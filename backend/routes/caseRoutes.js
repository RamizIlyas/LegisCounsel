import express from "express";
import { protect } from "../controllers/authMiddleware.js";
import {
  createCase,
  getCases,
  deleteCase,
  updateCase
} from "../controllers/caseController.js";

const router = express.Router();
router.use(protect);
router.post("/", createCase);
router.get("/", getCases);
router.delete("/:id", deleteCase);
router.put("/:id", updateCase);

export default router;
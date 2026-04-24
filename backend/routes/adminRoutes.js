import express from "express";
import { protect, adminOnly } from "../controllers/authMiddleware.js";
import { uploadLawPdf, uploadCasePdf } from "../config/multer.js"

// Controllers
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/adminUserController.js";

import {
  getAllLaws,
  getLawById,
  createLaw,
  updateLaw,
  deleteLaw,
} from "../controllers/adminLawController.js";

import {
  getAllCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
} from "../controllers/adminCaseController.js";

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

// ── User routes ───────────────────────────────────────────────────────────────
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// ── Law routes ────────────────────────────────────────────────────────────────
router.get("/laws", getAllLaws);
router.get("/laws/:id", getLawById);
router.post("/laws", uploadLawPdf, createLaw);
router.put("/laws/:id", uploadLawPdf, updateLaw);
router.delete("/laws/:id", deleteLaw);

// ── Case routes ───────────────────────────────────────────────────────────────
router.get("/cases", getAllCases);
router.get("/cases/:id", getCaseById);
router.post("/cases", uploadCasePdf, createCase);
router.put("/cases/:id", uploadCasePdf, updateCase);
router.delete("/cases/:id", deleteCase);

export default router;
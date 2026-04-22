// routes/bookmarkRoutes.js
import express from "express";
import { protect } from "../controllers/authMiddleware.js";
import {
  createBookmark,
  getBookmarks,
  deleteBookmark,
  deleteBookmarkByHash,
  updateBookmarkNote,
} from "../controllers/bookmarkController.js";

const router = express.Router();
router.use(protect);

router.post(  "/",               createBookmark);
router.get(   "/",               getBookmarks);
router.delete("/:id",            deleteBookmark);
router.delete("/by-hash/:hash",  deleteBookmarkByHash);
router.patch( "/:id",            updateBookmarkNote);

export default router;
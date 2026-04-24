// routes/userRoutes.js
import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from "../controllers/userController.js";
import { protect } from "../controllers/authMiddleware.js";

const router = express.Router();

router.use(protect); // all routes below require valid JWT

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.delete("/profile", deleteAccount);
router.put("/change-password", changePassword);

export default router;

/*
  Mount in your server entry file (server.js / app.js):

    import userRoutes from "./routes/userRoutes.js";
    app.use("/api/users", userRoutes);
*/
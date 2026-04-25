//authRoutes.js Route for User Authentication
import express from "express";
import { registerUser, loginUser, forgotPassword} from "../controllers/authController.js";

const router = express.Router();

router.post("/signup", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);

export default router;

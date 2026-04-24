// authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = "MY_SUPER_SECRET_KEY"; // same as authController — replace in production!

// ── Verify JWT + attach full user to req.user ─────────────────────────────────
export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach full user (minus password) to request
      req.user = await User.findById(decoded.id).select("-password");

      return next();
    }

    return res.status(401).json({ message: "No token provided" });
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ── Admin-only guard — always use AFTER protect ───────────────────────────────
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};
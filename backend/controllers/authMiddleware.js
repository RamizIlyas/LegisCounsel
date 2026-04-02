import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = "MY_SUPER_SECRET_KEY"; // same as authController // Replace in production!

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach full user to request
      req.user = await User.findById(decoded.id).select("-password");

      return next();
    }

    return res.status(401).json({ message: "No token provided" });
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
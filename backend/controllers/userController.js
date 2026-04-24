// controllers/userController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// ── GET /api/users/profile ─────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ── PUT /api/users/profile ─────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const { name, email, mobile, location, firm } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ message: "Name and email are required." });
    }

    // Block duplicate email (ignore own)
    const existing = await User.findOne({
      email: email.trim().toLowerCase(),
      _id: { $ne: req.user._id },
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Email is already in use by another account." });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile?.trim() ?? "",
        location: location?.trim() ?? "",
        firm: firm?.trim() ?? "",
      },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({
      message: "Profile updated successfully.",
      user: {
        id: updated._id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        mobile: updated.mobile,
        location: updated.location,
        firm: updated.firm,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ── PUT /api/users/change-password ─────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new passwords are required." });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters." });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ── DELETE /api/users/profile ──────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // TODO: if your app stores related data (cases, messages, documents),
    // delete those here too before responding.
    // e.g. await Case.deleteMany({ userId: req.user._id });

    res.json({ message: "Account deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
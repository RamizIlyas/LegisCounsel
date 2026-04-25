// authController.js  
import nodemailer from "nodemailer";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = "MY_SUPER_SECRET_KEY"; // Replace in production!

// ----------------------- REGISTER -----------------------
export const registerUser = async (req, res) => {
    // console.log("Signup API Hit", req.body);
  try {
    const { name, email, password, role } = req.body;
    // console.log("Received data:", { name, email, password, role });

    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All fields are required" });

    // Check if email already exists
    const existing = await User.findOne({ email });

    if (existing)
        return res.status(400).json({ message: "Email already registered" });

    
    // Hash password
    const hashedPass = await bcrypt.hash(password, 10);
    // console.log("Password hashed");
    const newUser = await User.create({
      name,
      email,
      password: hashedPass,
      role,
    });
    // console.log("New user created:", newUser);

    return res.status(201).json({
      message: "Signup successful",
      user: { id: newUser._id,name, email, role },
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

// ----------------------- LOGIN -----------------------
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email !" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid password !" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id,name:user.name, email: user.email, role: user.role },
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// ── helper: random 8-char alphanumeric password ──────────────────────────────
const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

// ── Nodemailer transporter (configure once) ───────────────────────────────────
// Store EMAIL_USER / EMAIL_PASS in your .env file — never hard-code credentials
// const transporter = nodemailer.createTransport({
//   service: "gmail",                        // swap to "outlook", "yahoo", etc. as needed
//   auth: {
//     user: process.env.EMAIL_USER,          // e.g. yourapp@gmail.com
//     pass: process.env.EMAIL_PASS,          // Gmail App Password (not your account password)
//   },
// });

// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: Number(process.env.EMAIL_PORT),
//   secure: false,
//   requireTLS: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// ── Lazy transporter — created on first use, not at module load ──────────────
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    // console.log(`.env Email: ${process.env.EMAIL_USER}`);
    // console.log(`.env Password: ${process.env.EMAIL_PASS}`);
    // console.log(`.env EMAIL_HOST: ${process.env.EMAIL_HOST}`);
    // console.log(`.env EMAIL_PORT: ${process.env.EMAIL_PORT}`);
    transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",   // hardcoded — no risk of undefined
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim())
      return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Return the same message whether the email exists or not (security best practice)
    if (!user) {
      return res.status(404).json({ message: "No account found with that email." });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update password in MongoDB
    user.password = hashedPassword;
    await user.save();
    
    // Send email with the temporary password
    await getTransporter().sendMail({
      from: `"LegisCounsel Support" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Your Temporary Password",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #1E3A8A;">Password Reset</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>We received a password reset request for your account. Here is your temporary password:</p>
          <div style="background:#f1f5f9; padding:16px; border-radius:8px; text-align:center;
                      font-size:24px; font-weight:bold; letter-spacing:4px; color:#1E293B;">
            ${tempPassword}
          </div>
          <p style="margin-top:16px;">
            Please sign in with this password and change it immediately from your profile settings.
          </p>
          <p style="color:#94a3b8; font-size:12px;">
            LegisCounsel Team<br>
            <a href="https://legiscounsel.app" style="color:#3b82f6; text-decoration:none;">legiscounsel.app</a>
          </p>
        </div>
      `,
    });
    console.log(`Temp Password : ${tempPassword}`);
    return res.json({ message: "A new password has been sent to your email." });

  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};
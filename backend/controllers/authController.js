import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = "MY_SUPER_SECRET_KEY"; // Replace in production!

// ----------------------- REGISTER -----------------------
export const registerUser = async (req, res) => {
    console.log("Signup API Hit", req.body);
  try {
    const { name, email, password, role } = req.body;
    console.log("Received data:", { name, email, password, role });

    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All fields are required" });

    // Check if email already exists
    const existing = await User.findOne({ email });

    if (existing)
        return res.status(400).json({ message: "Email already registered" });

    
    // Hash password
    const hashedPass = await bcrypt.hash(password, 10);
    console.log("Password hashed");
    const newUser = await User.create({
      name,
      email,
      password: hashedPass,
      role,
    });
    console.log("New user created:", newUser);

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

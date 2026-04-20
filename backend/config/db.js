import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/LegisCounsel");
    console.log("MongoDB connected (LegisCounsel)");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

export default connectDB;

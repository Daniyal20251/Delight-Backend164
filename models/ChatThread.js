import mongoose from "mongoose";

const chatThreadSchema = new mongoose.Schema(
  {
    threadId: { type: Number, required: true, unique: true },
    buyerPhone: { type: String, required: true },
    sellerPhone: { type: String, required: true },
    productId: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("ChatThread", chatThreadSchema);

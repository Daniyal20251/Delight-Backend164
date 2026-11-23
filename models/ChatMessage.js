import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    orderId: { type: Number, required: true },
    senderType: { type: String, required: true },
    senderPhone: { type: String, required: true },
    message: { type: String, default: "" },
    images: { type: [String], default: [] },
    isRead: { type: Boolean, default: false },
    productId: { type: Number, default: null },
    buyerPhone: { type: String, default: "" },
    sellerPhone: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("ChatMessage", chatMessageSchema);

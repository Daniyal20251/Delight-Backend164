import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    sellerPhone: { type: String, required: true },
    transactionId: { type: String, required: true, unique: true },
    paymentPhone: { type: String, default: "" },
    method: { type: String, default: "easypaisa" },
    amount: { type: Number, default: 0 },
    customDomain: { type: String, default: null },
    status: { type: String, default: "pending" },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);

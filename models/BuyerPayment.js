import mongoose from "mongoose";

const buyerPaymentSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    buyerName: { type: String, required: true },
    buyerPhone: { type: String, required: true },
    sellerPhone: { type: String, required: true },
    orderId: { type: Number, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    transactionId: { type: String, required: true, unique: true },
    screenshotUrl: { type: String, default: "" },
    status: { type: String, default: "pending" },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("BuyerPayment", buyerPaymentSchema);

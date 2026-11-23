import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    productId: { type: Number, default: null },
    buyerName: { type: String, required: true },
    buyerPhone: { type: String, required: true },
    address: { type: String, required: true },
    productData: { type: mongoose.Schema.Types.Mixed, required: true },
    sellerPhone: { type: String, required: true },
    status: { type: String, default: "Pending" },
    paymentStatus: { type: String, default: "unpaid" },
    paymentTransactionId: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);

import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    productId: { type: Number, required: true },
    buyerPhone: { type: String, required: true },
    buyerName: { type: String, required: true },
    rating: { type: Number, required: true },
    message: { type: String, default: "" },
    images: { type: [String], default: [] },
    isVerifiedPurchase: { type: Boolean, default: false },
    isFake: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Review", reviewSchema);

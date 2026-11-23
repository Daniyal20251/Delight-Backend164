import mongoose from "mongoose";

const productRatingSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true, unique: true },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    ratingBreakdown: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("ProductRating", productRatingSchema);

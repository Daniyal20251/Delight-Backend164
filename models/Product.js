import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    price: { type: String, required: true },
    discount: { type: String, default: "0" },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    category: { type: String, default: "Uncategorized" },
    description: { type: String, default: "" },
    sellerPhone: { type: String, required: true },
    imageUrls: { type: [String], default: [] },
    videoUrls: { type: [String], default: [] },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);

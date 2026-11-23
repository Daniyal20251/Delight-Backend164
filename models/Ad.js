import mongoose from "mongoose";

const adSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    link: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Ad", adSchema);

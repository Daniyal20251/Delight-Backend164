import mongoose from "mongoose";

const sellerVerificationSchema = new mongoose.Schema(
  {
    sellerPhone: { type: String, required: true, unique: true },
    fullName: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
    cnicNumber: { type: String, required: true },
    cnicFrontImage: { type: String, default: "" },
    cnicBackImage: { type: String, default: "" },
    selfieImage: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountTitle: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    iban: { type: String, default: "" },
    status: { type: String, default: "pending" },
    adminNotes: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SellerVerification", sellerVerificationSchema);

import mongoose from "mongoose";

const sellerSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    logoUrl: { type: String, default: "" },
    delivery: { type: Number, default: 0 },
    advanceDelivery: { type: Number, default: 0 },
    storeTheme: { type: String, default: "default" },
    plan: { type: String, default: "free" },
    planActivatedAt: { type: Date, default: null },
    planExpiresAt: { type: Date, default: null },
    adsUnlocked: { type: Boolean, default: false },
    customDomain: { type: String, default: null },
    domainStatus: { type: String, default: null },
    domainRequest: { type: String, default: null },
    domainRequestStatus: { type: String, default: null },
    domainRejectedReason: { type: String, default: null },
    domainSetupStatus: { type: String, default: "not_started" },
    assignedRepo: { type: String, default: null },
    verificationStatus: { type: String, default: null },
    advancePaymentEnabled: { type: Boolean, default: false },
    advancePaymentDeliveryCharge: { type: Number, default: 0 },
    easypaisa: {
      businessName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      qrCodeUrl: { type: String, default: "" },
    },
    jazzcash: {
      businessName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      qrCodeUrl: { type: String, default: "" },
    },
    kyc: {
      businessName: { type: String, default: "" },
      phone: { type: String, default: "" },
      cnicFrontUrl: { type: String, default: "" },
      cnicBackUrl: { type: String, default: "" },
      status: { type: String, default: "not_submitted" },
      rejectedReason: { type: String, default: null },
      submittedAt: { type: Date, default: null },
    },
    transactionHistory: [
      {
        transactionId: String,
        amount: Number,
        method: String,
        status: String,
        createdAt: Date,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Seller", sellerSchema);

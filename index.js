// ---------------------- IMPORTS ----------------------
import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

import dns from "dns/promises";
import connectDB from "./config/db.js";
import User from "./models/User.js";
import Seller from "./models/Seller.js";
import Product from "./models/Product.js";
import Order from "./models/Order.js";
import Ad from "./models/Ad.js";
import Payment from "./models/Payment.js";
import Review from "./models/Review.js";
import ProductRating from "./models/ProductRating.js";
import ChatMessage from "./models/ChatMessage.js";
import ChatThread from "./models/ChatThread.js";
import SellerVerification from "./models/SellerVerification.js";
import BuyerPayment from "./models/BuyerPayment.js";

// ---------------------- APP SETUP ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ---------------------- MULTER SETUP ----------------------
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

// ---------------------- CLOUDINARY CONFIG ----------------------
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

async function uploadToCloudinary(fileBuffer, folder = "delight") {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: "auto",
                transformation: [{ quality: "auto", fetch_format: "auto" }],
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            },
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
}

// ---------------------- DOMAIN MIDDLEWARE ----------------------
// Detects custom domains and attaches sellerPhone to request
const MAIN_DOMAIN = "delightpk.qzz.io";
const REPLIT_DOMAIN = "delight-backend--araindaniyalo2.replit.app";

app.use(async (req, res, next) => {
    const host = (req.headers.host || "").split(":")[0];
    if (host && host !== MAIN_DOMAIN && host !== REPLIT_DOMAIN && host !== "localhost") {
        try {
            // 1. Try exact match first
            let seller = await Seller.findOne({
                customDomain: host,
                domainStatus: "active",
            });

            // 2. If no match, check if it's a subdomain (e.g., my.cucucollection.shop)
            if (!seller && host.split(".").length >= 3) {
                const parts = host.split(".");
                const rootDomain = parts.slice(-2).join("."); // my.cucucollection.shop → cucucollection.shop
                seller = await Seller.findOne({
                    customDomain: rootDomain,
                    domainStatus: "active",
                });
            }

            if (seller) req.sellerPhone = seller.phone;
        } catch (e) {}
    }
    next();
});

// ---------------------- DATABASE CONNECTION ----------------------
await connectDB();

// ---------------------- AUTH ROUTES ----------------------
app.post("/signup", async (req, res) => {
    try {
        const { name, phone, password } = req.body;

        const existing = await User.findOne({ phone });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Phone already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const id = Date.now();

        await User.create({ id, name, phone, password: hashed });

        res.json({ success: true, user: { id, name, phone } });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { phone, password } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res
                .status(401)
                .json({ success: false, message: "Incorrect password" });
        }

        const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET);

        res.json({
            success: true,
            user: { id: user.id, name: user.name, phone: user.phone },
            token,
        });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/seller-signup", async (req, res) => {
    try {
        const { name, phone, password } = req.body;

        if (!name || !phone || !password) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Name, phone and password are required",
                });
        }

        const existing = await Seller.findOne({ phone });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Phone already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const id = Date.now();

        await Seller.create({
            id,
            name,
            phone,
            password: hashed,
            plan: "free",
        });

        const token = jwt.sign({ id, phone }, JWT_SECRET);

        res.json({
            success: true,
            seller: { id, name, phone, logo: "", delivery: 0 },
            token,
        });
    } catch (err) {
        console.error("Seller signup error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/seller-login", async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Phone and password are required",
                });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        const match = await bcrypt.compare(password, seller.password);
        if (!match) {
            return res
                .status(401)
                .json({ success: false, message: "Incorrect password" });
        }

        const token = jwt.sign(
            { id: seller.id, phone: seller.phone },
            JWT_SECRET,
        );

        res.json({
            success: true,
            seller: {
                id: seller.id,
                name: seller.name,
                phone: seller.phone,
                logo: seller.logoUrl || "",
                delivery: seller.delivery || 0,
                plan: seller.plan || "free",
            },
            token,
        });
    } catch (err) {
        console.error("Seller login error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- SETTINGS ----------------------
app.post(
    "/update-settings",
    upload.fields([
        { name: "logo", maxCount: 1 },
        { name: "easypaisaQr", maxCount: 1 },
        { name: "jazzcashQr", maxCount: 1 },
        { name: "cnicFront", maxCount: 1 },
        { name: "cnicBack", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const {
                name,
                phone,
                sellerPhone,
                delivery,
                advanceDelivery,
                easypaisaBusinessName,
                easypaisaAccountNumber,
                jazzcashBusinessName,
                jazzcashAccountNumber,
                kycBusinessName,
                kycPhone,
            } = req.body;
            const phoneNumber = phone || sellerPhone;

            if (!phoneNumber) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Phone number is required",
                    });
            }

            const seller = await Seller.findOne({ phone: phoneNumber });
            if (!seller) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        message: "Seller not found with this phone number",
                    });
            }

            if (req.files?.logo?.[0]) {
                seller.logoUrl = await uploadToCloudinary(
                    req.files.logo[0].buffer,
                    "delight/logos",
                );
            }
            if (name) seller.name = name;

            // ---- Delivery Charges (COD + Advance) ----
            if (
                delivery !== undefined &&
                delivery !== null &&
                delivery !== "" &&
                !isNaN(delivery)
            ) {
                seller.delivery = Number(delivery);
            }
            if (
                advanceDelivery !== undefined &&
                advanceDelivery !== null &&
                advanceDelivery !== "" &&
                !isNaN(advanceDelivery)
            ) {
                seller.advanceDelivery = Number(advanceDelivery);
            }

            // ---- EasyPaisa Payment Details ----
            seller.easypaisa = seller.easypaisa || {};
            if (easypaisaBusinessName)
                seller.easypaisa.businessName = easypaisaBusinessName;
            if (easypaisaAccountNumber)
                seller.easypaisa.accountNumber = easypaisaAccountNumber;
            if (req.files?.easypaisaQr?.[0]) {
                seller.easypaisa.qrCodeUrl = await uploadToCloudinary(
                    req.files.easypaisaQr[0].buffer,
                    "delight/payments/easypaisa",
                );
            }

            // ---- JazzCash Payment Details ----
            seller.jazzcash = seller.jazzcash || {};
            if (jazzcashBusinessName)
                seller.jazzcash.businessName = jazzcashBusinessName;
            if (jazzcashAccountNumber)
                seller.jazzcash.accountNumber = jazzcashAccountNumber;
            if (req.files?.jazzcashQr?.[0]) {
                seller.jazzcash.qrCodeUrl = await uploadToCloudinary(
                    req.files.jazzcashQr[0].buffer,
                    "delight/payments/jazzcash",
                );
            }

            // ---- Seller KYC ----
            seller.kyc = seller.kyc || {};
            if (kycBusinessName) seller.kyc.businessName = kycBusinessName;
            if (kycPhone) seller.kyc.phone = kycPhone;
            if (req.files?.cnicFront?.[0]) {
                seller.kyc.cnicFrontUrl = await uploadToCloudinary(
                    req.files.cnicFront[0].buffer,
                    "delight/kyc",
                );
            }
            if (req.files?.cnicBack?.[0]) {
                seller.kyc.cnicBackUrl = await uploadToCloudinary(
                    req.files.cnicBack[0].buffer,
                    "delight/kyc",
                );
            }
            // Any new/changed KYC submission resets verification to pending for admin review
            const hasNewKycData =
                (kycBusinessName && kycBusinessName.trim()) ||
                (kycPhone && kycPhone.trim()) ||
                req.files?.cnicFront?.[0] ||
                req.files?.cnicBack?.[0];
            if (hasNewKycData) {
                seller.kyc.status = "pending";
                seller.kyc.rejectedReason = null;
                seller.kyc.submittedAt = new Date();
            }

            seller.markModified("easypaisa");
            seller.markModified("jazzcash");
            await seller.save();

            res.json({
                success: true,
                message: "Settings updated successfully",
                seller: {
                    id: seller.id,
                    name: seller.name || "",
                    phone: seller.phone,
                    logo: seller.logoUrl || "",
                    delivery: seller.delivery || 0,
                    advanceDelivery: seller.advanceDelivery || 0,
                    easypaisa: {
                        businessName: seller.easypaisa?.businessName || "",
                        accountNumber: seller.easypaisa?.accountNumber || "",
                        qrCode: seller.easypaisa?.qrCodeUrl || "",
                    },
                    jazzcash: {
                        businessName: seller.jazzcash?.businessName || "",
                        accountNumber: seller.jazzcash?.accountNumber || "",
                        qrCode: seller.jazzcash?.qrCodeUrl || "",
                    },
                    kyc: {
                        businessName: seller.kyc?.businessName || "",
                        phone: seller.kyc?.phone || "",
                        cnicFront: seller.kyc?.cnicFrontUrl || "",
                        cnicBack: seller.kyc?.cnicBackUrl || "",
                        status: seller.kyc?.status || "not_submitted",
                        rejectedReason: seller.kyc?.rejectedReason || null,
                    },
                },
            });
        } catch (err) {
            console.error("Update settings error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

app.get("/settings", async (req, res) => {
    try {
        const { phone, sellerPhone } = req.query;
        const phoneNumber = phone || sellerPhone;

        if (!phoneNumber)
            return res.status(400).json({ error: "Missing phone" });

        const s = await Seller.findOne({ phone: phoneNumber });

        if (s) {
            res.json({
                id: s.id,
                name: s.name,
                phone: s.phone,
                logo: s.logoUrl || "",
                delivery: s.delivery || 0,
                advanceDelivery: s.advanceDelivery || 0,
                easypaisa: {
                    businessName: s.easypaisa?.businessName || "",
                    accountNumber: s.easypaisa?.accountNumber || "",
                    qrCode: s.easypaisa?.qrCodeUrl || "",
                },
                jazzcash: {
                    businessName: s.jazzcash?.businessName || "",
                    accountNumber: s.jazzcash?.accountNumber || "",
                    qrCode: s.jazzcash?.qrCodeUrl || "",
                },
                kyc: {
                    businessName: s.kyc?.businessName || "",
                    phone: s.kyc?.phone || "",
                    cnicFront: s.kyc?.cnicFrontUrl || "",
                    cnicBack: s.kyc?.cnicBackUrl || "",
                    status: s.kyc?.status || "not_submitted",
                    rejectedReason: s.kyc?.rejectedReason || null,
                },
            });
        } else {
            res.json({ name: "", logo: "", delivery: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------- THEME ROUTES ----------------------

app.get("/seller-theme/:phone", async (req, res) => {
    try {
        const seller = await Seller.findOne({ phone: req.params.phone });
        if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });
        res.json({ success: true, theme: seller.storeTheme || "default" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/seller-theme", async (req, res) => {
    try {
        const { phone, theme } = req.body;
        if (!phone || !theme) return res.status(400).json({ success: false, message: "phone and theme required" });
        const seller = await Seller.findOne({ phone });
        if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });
        seller.storeTheme = theme;
        await seller.save();
        res.json({ success: true, message: "Theme saved!", theme });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// -------------------------------------------------------
app.get("/seller/:phone", async (req, res) => {
    try {
        const s = await Seller.findOne({ phone: req.params.phone });
        if (!s) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }
        res.json({
            success: true,
            seller: {
                id: s.id,
                name: s.name,
                phone: s.phone,
                logo: s.logoUrl || "",
                delivery: s.delivery || 0,
                advanceDelivery: s.advanceDelivery || 0,
                storeTheme: s.storeTheme || "default",
                easypaisa: {
                    businessName: s.easypaisa?.businessName || "",
                    accountNumber: s.easypaisa?.accountNumber || "",
                    qrCode: s.easypaisa?.qrCodeUrl || "",
                },
                jazzcash: {
                    businessName: s.jazzcash?.businessName || "",
                    accountNumber: s.jazzcash?.accountNumber || "",
                    qrCode: s.jazzcash?.qrCodeUrl || "",
                },
                kyc: {
                    businessName: s.kyc?.businessName || "",
                    phone: s.kyc?.phone || "",
                    cnicFront: s.kyc?.cnicFrontUrl || "",
                    cnicBack: s.kyc?.cnicBackUrl || "",
                    status: s.kyc?.status || "not_submitted",
                    rejectedReason: s.kyc?.rejectedReason || null,
                },
                createdAt: s.createdAt,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/all-stores", async (req, res) => {
    try {
        const sellers = await Seller.find().sort({ createdAt: -1 });
        res.json(
            sellers.map((s) => ({
                id: s.id,
                name: s.name,
                phone: s.phone,
                logo: s.logoUrl || "",
                delivery: s.delivery || 0,
                advanceDelivery: s.advanceDelivery || 0,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stores" });
    }
});

// ---------------------- PRODUCTS ----------------------
app.post(
    "/add-product",
    upload.fields([
        { name: "images", maxCount: 12 },
        { name: "videos", maxCount: 3 },
    ]),
    async (req, res) => {
        try {
            const {
                title,
                price,
                discount,
                category,
                colors,
                sizes,
                sellerPhone,
                description,
            } = req.body;

            // ── SELLER PLAN CHECK + FREE DAILY LIMIT ──
            const seller = await Seller.findOne({ phone: sellerPhone });
            if (!seller) {
                return res
                    .status(404)
                    .json({ success: false, message: "Seller not found" });
            }

            // Auto-downgrade if premium expired
            let currentPlan = seller.plan || "free";
            if (
                (currentPlan === "premium" || currentPlan === "yearly") &&
                seller.planExpiresAt &&
                new Date() > seller.planExpiresAt
            ) {
                currentPlan = "free";
                await Seller.findOneAndUpdate(
                    { phone: sellerPhone },
                    { plan: "free", adsUnlocked: false },
                );
            }

            // Free seller daily upload limit (2 per day)
            if (currentPlan !== "premium" && currentPlan !== "yearly") {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const todayUploads = await Product.countDocuments({
                    sellerPhone,
                    createdAt: { $gte: today, $lt: tomorrow },
                });

                if (todayUploads >= 2) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "Daily upload limit reached. Free sellers can upload max 2 products per day. Upgrade to premium for unlimited uploads.",
                        limitReached: true,
                        plan: "free",
                    });
                }
            }
            // ── END PLAN CHECK ──

            const imageUrls = [];
            const videoUrls = [];

            if (req.files?.images) {
                for (const file of req.files.images) {
                    imageUrls.push(
                        await uploadToCloudinary(
                            file.buffer,
                            "delight/products",
                        ),
                    );
                }
            }
            if (req.files?.videos) {
                for (const file of req.files.videos) {
                    videoUrls.push(
                        await uploadToCloudinary(
                            file.buffer,
                            "delight/products",
                        ),
                    );
                }
            }

            const id = Date.now();

            await Product.create({
                id,
                title,
                price: String(price),
                discount: String(discount || "0"),
                colors: colors ? colors.split(",").map((s) => s.trim()) : [],
                sizes: sizes ? sizes.split(",").map((s) => s.trim()) : [],
                category: category || "Uncategorized",
                description: description || "",
                sellerPhone,
                imageUrls,
                videoUrls,
            });

            res.json({
                success: true,
                message: "Product uploaded successfully",
                product: {
                    id,
                    title,
                    price: String(price),
                    discount: String(discount || "0"),
                    colors: colors
                        ? colors.split(",").map((s) => s.trim())
                        : [],
                    sizes: sizes ? sizes.split(",").map((s) => s.trim()) : [],
                    category: category || "Uncategorized",
                    description: description || "",
                    sellerPhone,
                    images: imageUrls,
                    videos: videoUrls,
                    views: 0,
                    createdAt: new Date().toISOString(),
                },
            });
        } catch (err) {
            console.error("❌ Add product error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

app.get("/products", async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });

        res.json(
            products.map((p) => ({
                id: p.id,
                title: p.title,
                price: p.price,
                discount: p.discount,
                colors: p.colors || [],
                sizes: p.sizes || [],
                category: p.category,
                description: p.description,
                sellerPhone: p.sellerPhone,
                images: p.imageUrls || [],
                videos: p.videoUrls || [],
                views: p.views || 0,
                createdAt: p.createdAt,
            })),
        );
    } catch (err) {
        console.error("Get products error:", err);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

app.get("/products/:phone", async (req, res) => {
    try {
        const products = await Product.find({
            sellerPhone: req.params.phone,
        }).sort({ createdAt: -1 });

        res.json(
            products.map((p) => ({
                id: p.id,
                title: p.title,
                price: p.price,
                discount: p.discount,
                colors: p.colors || [],
                sizes: p.sizes || [],
                category: p.category,
                description: p.description,
                sellerPhone: p.sellerPhone,
                images: p.imageUrls || [],
                videos: p.videoUrls || [],
                views: p.views || 0,
                createdAt: p.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch seller products" });
    }
});

app.put(
    "/edit-product/:id",
    upload.fields([
        { name: "images", maxCount: 12 },
        { name: "videos", maxCount: 3 },
    ]),
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const product = await Product.findOne({ id });

            if (!product) {
                return res
                    .status(404)
                    .json({ success: false, message: "Product not found" });
            }

            const {
                title,
                price,
                discount,
                colors,
                sizes,
                category,
                description,
                sellerPhone,
            } = req.body;

            let imageUrls = product.imageUrls || [];
            let videoUrls = product.videoUrls || [];

            if (req.body.existingImages) {
                try {
                    const parsed = JSON.parse(req.body.existingImages);
                    if (Array.isArray(parsed)) imageUrls = parsed;
                } catch (e) {}
            }
            if (req.body.existingVideos) {
                try {
                    const parsed = JSON.parse(req.body.existingVideos);
                    if (Array.isArray(parsed)) videoUrls = parsed;
                } catch (e) {}
            }

            if (req.files?.images?.length > 0) {
                for (const file of req.files.images) {
                    imageUrls.push(
                        await uploadToCloudinary(
                            file.buffer,
                            "delight/products",
                        ),
                    );
                }
            }
            if (req.files?.videos?.length > 0) {
                for (const file of req.files.videos) {
                    videoUrls.push(
                        await uploadToCloudinary(
                            file.buffer,
                            "delight/products",
                        ),
                    );
                }
            }

            if (imageUrls.length > 12) imageUrls = imageUrls.slice(0, 12);
            if (videoUrls.length > 3) videoUrls = videoUrls.slice(0, 3);

            if (title) product.title = title;
            if (price) product.price = String(price);
            if (discount) product.discount = String(discount);
            if (colors) product.colors = colors.split(",").map((s) => s.trim());
            if (sizes) product.sizes = sizes.split(",").map((s) => s.trim());
            if (category) product.category = category;
            if (description) product.description = description;
            if (sellerPhone) product.sellerPhone = sellerPhone;
            product.imageUrls = imageUrls;
            product.videoUrls = videoUrls;

            await product.save();

            res.json({
                success: true,
                product: {
                    id: product.id,
                    title: product.title,
                    price: product.price,
                    discount: product.discount,
                    colors: product.colors || [],
                    sizes: product.sizes || [],
                    category: product.category,
                    description: product.description,
                    sellerPhone: product.sellerPhone,
                    images: product.imageUrls || [],
                    videos: product.videoUrls || [],
                    views: product.views || 0,
                    createdAt: product.createdAt,
                },
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

app.delete("/products/:id", async (req, res) => {
    try {
        await Product.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true, message: "Product deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- ORDERS ----------------------
app.post("/place-order", async (req, res) => {
    try {
        const {
            buyerName,
            buyerPhone,
            address,
            product,
            sellerPhone,
            productId,
        } = req.body;
        const id = Date.now();

        const productData = {
            ...product,
            total: Number(product.price) + (product.delivery || 0),
        };

        await Order.create({
            id,
            productId: Number(productId) || null,
            buyerName,
            buyerPhone,
            address,
            productData,
            sellerPhone,
            status: "Pending",
        });

        res.json({
            success: true,
            message: "Order placed successfully",
            order: {
                id,
                productId,
                buyerName,
                buyerPhone,
                address,
                product: productData,
                sellerPhone,
                status: "Pending",
                createdAt: new Date().toISOString(),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/customer-orders/:phone", async (req, res) => {
    try {
        const orders = await Order.find({ buyerPhone: req.params.phone }).sort({
            createdAt: -1,
        });
        res.json(
            orders.map((o) => ({
                id: o.id,
                productId: o.productId,
                buyerName: o.buyerName,
                buyerPhone: o.buyerPhone,
                address: o.address,
                product: o.productData,
                sellerPhone: o.sellerPhone,
                status: o.status,
                createdAt: o.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/seller-orders/:phone", async (req, res) => {
    try {
        const orders = await Order.find({ sellerPhone: req.params.phone }).sort(
            { createdAt: -1 },
        );
        res.json(
            orders.map((o) => ({
                id: o.id,
                productId: o.productId,
                buyerName: o.buyerName,
                buyerPhone: o.buyerPhone,
                address: o.address,
                product: o.productData,
                sellerPhone: o.sellerPhone,
                status: o.status,
                createdAt: o.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/admin/orders", async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(
            orders.map((o) => ({
                id: o.id,
                productId: o.productId,
                buyerName: o.buyerName,
                buyerPhone: o.buyerPhone,
                address: o.address,
                product: o.productData,
                sellerPhone: o.sellerPhone,
                status: o.status,
                createdAt: o.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/update-order/:id", async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate(
            { id: Number(req.params.id) },
            { status: req.body.status },
            { returnDocument: "after" },
        );
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/cancel-order/:id", async (req, res) => {
    try {
        const existing = await Order.findOne({ id: Number(req.params.id) });
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Order not found" });
        }
        if (existing.status !== "Pending") {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Only pending orders can be cancelled",
                });
        }
        await Order.findOneAndUpdate(
            { id: Number(req.params.id) },
            { status: "Cancelled" },
        );
        res.json({ success: true, message: "Order cancelled" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- ADS ----------------------
app.post("/admin/add-ad", upload.single("image"), async (req, res) => {
    try {
        const { title, link } = req.body;

        let imageUrl = "";
        if (req.file) {
            imageUrl = await uploadToCloudinary(req.file.buffer, "delight/ads");
        }

        const id = Date.now();
        await Ad.create({ id, title, link: link || "", imageUrl });

        res.json({
            success: true,
            message: "Ad added successfully",
            ad: { id, title, link: link || "", image: imageUrl },
        });
    } catch (err) {
        console.error("Add ad error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/admin/ads", async (req, res) => {
    try {
        const ads = await Ad.find().sort({ createdAt: -1 });
        res.json(
            ads.map((a) => ({
                id: a.id,
                title: a.title,
                link: a.link,
                image: a.imageUrl || "",
                createdAt: a.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/admin/delete-ad/:id", async (req, res) => {
    try {
        await Ad.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true, message: "Ad deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------- PRODUCT VIEWS COUNTER ----------------------
app.post("/products/:id/view", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const product = await Product.findOneAndUpdate(
            { id },
            { $inc: { views: 1 } },
            { returnDocument: "after" },
        );
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }
        res.json({ success: true, productId: id, views: product.views });
    } catch (err) {
        console.error("Increment views error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/products/:id/views", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const product = await Product.findOne({ id }, "views");
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }
        res.json({ success: true, productId: id, views: product.views || 0 });
    } catch (err) {
        console.error("Get views error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/", (req, res) => {
    res.json({
        message: "✅ Delight Backend Running with MongoDB ☁️",
        status: "OK",
        database: "MongoDB Atlas ✅",
        cloudinary: process.env.CLOUDINARY_CLOUD_NAME
            ? "✅ Configured"
            : "❌ NOT CONFIGURED",
        media_storage: "Cloudinary ☁️",
    });
});

// ---------------------- SUBSCRIPTION ROUTES ----------------------

// A) POST /verify-payment — verify & activate premium plan
app.post("/verify-payment", async (req, res) => {
    try {
        const {
            sellerPhone,
            transactionId,
            paymentPhone,
            method,
            amount,
            customDomain,
        } = req.body;

        if (!sellerPhone || !transactionId) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "sellerPhone and transactionId are required",
                });
        }

        const existing = await Payment.findOne({ transactionId });
        if (existing) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Transaction ID already used",
                });
        }

        const now = new Date();
        const isYearly = req.body.plan === "yearly" || Number(amount) === 9999;
        const expiresAt = new Date(
            now.getTime() + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000,
        );

        const payment = await Payment.create({
            sellerPhone,
            transactionId,
            paymentPhone: paymentPhone || "",
            method: method || "easypaisa",
            amount: Number(amount) || 0,
            customDomain: customDomain || null,
            status: "verified",
            verifiedAt: now,
        });

        await Seller.findOneAndUpdate(
            { phone: sellerPhone },
            {
                plan: isYearly ? "yearly" : "premium",
                planActivatedAt: now,
                planExpiresAt: expiresAt,
                adsUnlocked: true,
                ...(customDomain
                    ? { customDomain, domainStatus: "pending" }
                    : {}),
                $push: {
                    transactionHistory: {
                        transactionId,
                        amount: Number(amount) || 0,
                        method: method || "easypaisa",
                        status: "verified",
                        createdAt: now,
                    },
                },
            },
        );

        res.json({
            success: true,
            message: "Payment verified. Seller upgraded to premium.",
            expiresAt,
            adsUnlocked: true,
        });
    } catch (err) {
        console.error("Verify payment error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// B) GET /plan-status/:phone — check plan and auto-downgrade if expired
app.get("/plan-status/:phone", async (req, res) => {
    try {
        const seller = await Seller.findOne({ phone: req.params.phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        let isExpired = false;
        if (
            (seller.plan === "premium" || seller.plan === "yearly") &&
            seller.planExpiresAt &&
            seller.planExpiresAt < new Date()
        ) {
            isExpired = true;
            await Seller.findOneAndUpdate(
                { phone: req.params.phone },
                { plan: "free", adsUnlocked: false },
            );
            seller.plan = "free";
            seller.adsUnlocked = false;
        }

        res.json({
            success: true,
            plan: seller.plan,
            expiresAt: seller.planExpiresAt || null,
            customDomain: seller.customDomain || null,
            domainStatus: seller.domainStatus || null,
            adsUnlocked: seller.adsUnlocked || false,
            domainSetupStatus: seller.domainSetupStatus || "not_started",
            isExpired,
        });
    } catch (err) {
        console.error("Plan status error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// C) POST /seller/update-domain — submit domain request for admin review
app.post("/seller/update-domain", async (req, res) => {
    try {
        const { phone, domain } = req.body;

        if (!phone || !domain) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "phone and domain are required",
                });
        }

        if (!domain.includes(".") || domain.includes(" ")) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid domain format" });
        }

        const taken = await Seller.findOne({
            domainRequest: domain,
            phone: { $ne: phone },
            domainRequestStatus: { $in: ["pending", "approved"] },
        });
        if (taken) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Domain already requested by another seller",
                });
        }

        await Seller.findOneAndUpdate(
            { phone },
            {
                domainRequest: domain,
                domainRequestStatus: "pending",
                domainRejectedReason: null,
            },
        );

        res.json({
            success: true,
            message: "Domain request submitted. Under admin review.",
            domain,
            domainRequestStatus: "pending",
        });
    } catch (err) {
        console.error("Update domain error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// D) POST /seller/verify-domain — check domain request status
app.post("/seller/verify-domain", async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        if (!seller.domainRequest) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: "No domain request found. Submit one first.",
                });
        }

        if (seller.domainRequestStatus === "pending") {
            return res.json({
                success: true,
                domainRequestStatus: "pending",
                message: "Under admin review. Please wait.",
                domain: seller.domainRequest,
            });
        }

        if (seller.domainRequestStatus === "approved") {
            return res.json({
                success: true,
                domainRequestStatus: "approved",
                message: "Domain approved and active!",
                domain: seller.customDomain,
                domainStatus: seller.domainStatus,
                assignedRepo: seller.assignedRepo || null,
                storeUrl: seller.customDomain
                    ? `https://${seller.customDomain}`
                    : null,
                domainSetupStatus: seller.domainSetupStatus || "not_started",
            });
        }

        if (seller.domainRequestStatus === "rejected") {
            return res.json({
                success: false,
                domainRequestStatus: "rejected",
                message: "Domain request rejected by admin.",
                reason: seller.domainRejectedReason || "No reason provided.",
                domain: seller.domainRequest,
            });
        }

        res.json({
            success: true,
            domainRequestStatus: seller.domainRequestStatus,
        });
    } catch (err) {
        console.error("Verify domain error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// E) POST /seller/mark-setup-complete — seller marks DNS setup as done
app.post("/seller/mark-setup-complete", async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        if (seller.domainRequestStatus !== "approved") {
            return res.json({
                success: false,
                message: "No approved domain request found.",
            });
        }

        await Seller.findOneAndUpdate(
            { phone },
            {
                domainSetupStatus: "pending",
                domainStatus: "pending",
            },
        );

        res.json({
            success: true,
            message: "Setup marked complete. Admin will verify DNS.",
        });
    } catch (err) {
        console.error("Mark setup complete error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- ADMIN DOMAIN MANAGEMENT ----------------------

// GET /admin/domain-requests — list all pending domain requests
app.get("/admin/domain-requests", async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status
            ? { domainRequestStatus: status }
            : {
                  domainRequestStatus: {
                      $in: ["pending", "approved", "rejected"],
                  },
              };

        const sellers = await Seller.find(filter)
            .select(
                "id name phone domainRequest domainRequestStatus domainRejectedReason customDomain assignedRepo domainStatus domainSetupStatus createdAt",
            )
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: sellers.length,
            requests: sellers.map((s) => ({
                sellerId: s.id,
                name: s.name,
                phone: s.phone,
                requestedDomain: s.domainRequest,
                status: s.domainRequestStatus,
                rejectedReason: s.domainRejectedReason || null,
                activeDomain: s.customDomain || null,
                assignedRepo: s.assignedRepo || null,
                domainStatus: s.domainStatus || null,
                domainSetupStatus: s.domainSetupStatus || "not_started",
            })),
        });
    } catch (err) {
        console.error("Admin domain requests error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/approve-domain — approve and activate a seller's domain
app.post("/admin/approve-domain", async (req, res) => {
    try {
        const { phone, assignedRepo } = req.body;

        if (!phone) {
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller || !seller.domainRequest) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: "No domain request found for this seller",
                });
        }

        await Seller.findOneAndUpdate(
            { phone },
            {
                customDomain: seller.domainRequest,
                domainStatus: "pending",
                domainRequestStatus: "approved",
                domainSetupStatus: "not_started",
                domainRejectedReason: null,
                assignedRepo: assignedRepo || null,
            },
        );

        res.json({
            success: true,
            message: "Domain approved and activated.",
            phone,
            approvedDomain: seller.domainRequest,
            assignedRepo: assignedRepo || null,
        });
    } catch (err) {
        console.error("Admin approve domain error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/reject-domain — reject a seller's domain request
app.post("/admin/reject-domain", async (req, res) => {
    try {
        const { phone, reason } = req.body;

        if (!phone) {
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller || !seller.domainRequest) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: "No domain request found for this seller",
                });
        }

        await Seller.findOneAndUpdate(
            { phone },
            {
                domainRequestStatus: "rejected",
                domainRejectedReason: reason || "Request rejected by admin.",
            },
        );

        res.json({
            success: true,
            message: "Domain request rejected.",
            phone,
            rejectedDomain: seller.domainRequest,
            reason: reason || "Request rejected by admin.",
        });
    } catch (err) {
        console.error("Admin reject domain error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/verify-dns — admin confirms DNS is live, activates domain
app.post("/admin/verify-dns", async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });
        }

        const seller = await Seller.findOne({ phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        if (seller.domainSetupStatus !== "pending") {
            return res.json({
                success: false,
                message: "DNS setup not marked complete by seller yet.",
            });
        }

        await Seller.findOneAndUpdate(
            { phone },
            { domainSetupStatus: "verified", domainStatus: "active" },
        );

        res.json({
            success: true,
            message: "DNS verified. Domain is now active.",
        });
    } catch (err) {
        console.error("Admin verify DNS error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// E) POST /renew-subscription — extend premium by 30 days
app.post("/renew-subscription", async (req, res) => {
    try {
        const { sellerPhone, transactionId, paymentPhone, method } = req.body;

        if (!sellerPhone || !transactionId) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "sellerPhone and transactionId are required",
                });
        }

        const existing = await Payment.findOne({ transactionId });
        if (existing) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Transaction ID already used",
                });
        }

        const seller = await Seller.findOne({ phone: sellerPhone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        const now = new Date();
        const baseDate =
            seller.plan === "premium" && seller.planExpiresAt > now
                ? seller.planExpiresAt
                : now;
        const newExpiry = new Date(
            baseDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        await Payment.create({
            sellerPhone,
            transactionId,
            paymentPhone: paymentPhone || "",
            method: method || "easypaisa",
            status: "verified",
            verifiedAt: now,
        });

        await Seller.findOneAndUpdate(
            { phone: sellerPhone },
            {
                plan: "premium",
                planExpiresAt: newExpiry,
                adsUnlocked: true,
                $push: {
                    transactionHistory: {
                        transactionId,
                        method: method || "easypaisa",
                        status: "verified",
                        createdAt: now,
                    },
                },
            },
        );

        res.json({
            success: true,
            message: "Subscription renewed for 30 days.",
            newExpiresAt: newExpiry,
        });
    } catch (err) {
        console.error("Renew subscription error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// F) GET /store-by-domain?domain=... — get seller by active custom domain
app.get("/store-by-domain", async (req, res) => {
    try {
        const { domain } = req.query;
        if (!domain) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "domain query param required",
                });
        }

        const seller = await Seller.findOne({
            customDomain: domain,
            domainStatus: "active",
        });
        if (!seller) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: "No active store found for this domain",
                });
        }

        res.json({
            success: true,
            seller: {
                name: seller.name,
                phone: seller.phone,
                logoUrl: seller.logoUrl || "",
                delivery: seller.delivery || 0,
                advanceDelivery: seller.advanceDelivery || 0,
                easypaisa: {
                    businessName: seller.easypaisa?.businessName || "",
                    accountNumber: seller.easypaisa?.accountNumber || "",
                    qrCode: seller.easypaisa?.qrCodeUrl || "",
                },
                jazzcash: {
                    businessName: seller.jazzcash?.businessName || "",
                    accountNumber: seller.jazzcash?.accountNumber || "",
                    qrCode: seller.jazzcash?.qrCodeUrl || "",
                },
                storeName: seller.name,
                customDomain: seller.customDomain,
            },
        });
    } catch (err) {
        console.error("Store by domain error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== FEATURE 1: RATINGS & REVIEWS =====================

async function recalculateProductRating(productId) {
    const reviews = await Review.find({ productId });
    const total = reviews.length;
    if (total === 0) {
        await ProductRating.findOneAndUpdate(
            { productId },
            {
                averageRating: 0,
                totalReviews: 0,
                ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            },
            { upsert: true },
        );
        return;
    }
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
        breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
        sum += r.rating;
    }
    const averageRating = Math.round((sum / total) * 10) / 10;
    await ProductRating.findOneAndUpdate(
        { productId },
        { averageRating, totalReviews: total, ratingBreakdown: breakdown },
        { upsert: true },
    );
}

// POST /reviews/:productId — submit a review
app.post("/reviews/:productId", upload.array("images", 5), async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        const { buyerPhone, buyerName, rating, message } = req.body;

        if (!buyerPhone || !buyerName || !rating) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "buyerPhone, buyerName and rating are required",
                });
        }
        const ratingNum = Number(rating);
        if (ratingNum < 1 || ratingNum > 5) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Rating must be between 1 and 5",
                });
        }

        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res
                .status(404)
                .json({ success: false, message: "Product not found" });
        }

        const existing = await Review.findOne({
            productId,
            buyerPhone,
            isFake: false,
        });
        if (existing) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "You have already reviewed this product",
                });
        }

        const verifiedPurchase = await Order.findOne({ productId, buyerPhone });

        const imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const url = await uploadToCloudinary(
                    file.buffer,
                    "delight/reviews",
                );
                imageUrls.push(url);
            }
        }

        const id = Date.now();
        const review = await Review.create({
            id,
            productId,
            buyerPhone,
            buyerName,
            rating: ratingNum,
            message: message || "",
            images: imageUrls,
            isVerifiedPurchase: !!verifiedPurchase,
            isFake: false,
        });

        await recalculateProductRating(productId);

        res.json({ success: true, review });
    } catch (err) {
        console.error("Submit review error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /reviews/:productId — get all reviews for a product
app.get("/reviews/:productId", async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        const reviews = await Review.find({ productId }).sort({
            createdAt: -1,
        });
        res.json({ success: true, count: reviews.length, reviews });
    } catch (err) {
        console.error("Get reviews error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /reviews/:reviewId — admin deletes a review
app.delete("/reviews/:reviewId", async (req, res) => {
    try {
        const reviewId = Number(req.params.reviewId);
        const review = await Review.findOne({ id: reviewId });
        if (!review) {
            return res
                .status(404)
                .json({ success: false, message: "Review not found" });
        }
        const productId = review.productId;
        await Review.deleteOne({ id: reviewId });
        await recalculateProductRating(productId);
        res.json({ success: true, message: "Review deleted" });
    } catch (err) {
        console.error("Delete review error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /product-rating/:productId — get average rating and breakdown
app.get("/product-rating/:productId", async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        const rating = await ProductRating.findOne({ productId });
        if (!rating) {
            return res.json({
                success: true,
                productId,
                averageRating: 0,
                totalReviews: 0,
                ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            });
        }
        res.json({ success: true, ...rating.toObject() });
    } catch (err) {
        console.error("Product rating error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/add-fake-review/:productId — admin or premium/yearly sellers add fake reviews
app.post(
    "/admin/add-fake-review/:productId",
    upload.array("images", 5),
    async (req, res) => {
        try {
            const productId = Number(req.params.productId);
            const { sellerPhone, buyerPhone, buyerName, rating, message } =
                req.body;

            if (!buyerPhone || !buyerName || !rating) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "buyerPhone, buyerName and rating are required",
                    });
            }
            const ratingNum = Number(rating);
            if (ratingNum < 1 || ratingNum > 5) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Rating must be between 1 and 5",
                    });
            }

            if (sellerPhone) {
                const seller = await Seller.findOne({ phone: sellerPhone });
                if (!seller) {
                    return res
                        .status(404)
                        .json({ success: false, message: "Seller not found" });
                }
                if (seller.plan === "free") {
                    return res
                        .status(403)
                        .json({
                            success: false,
                            message:
                                "Free plan sellers cannot add fake reviews. Upgrade to premium.",
                        });
                }
                const fakeCount = await Review.countDocuments({
                    productId,
                    isFake: true,
                });
                if (fakeCount >= 10) {
                    return res
                        .status(403)
                        .json({
                            success: false,
                            message:
                                "Maximum 10 fake reviews per product reached",
                        });
                }
            }

            const imageUrls = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const url = await uploadToCloudinary(
                        file.buffer,
                        "delight/reviews",
                    );
                    imageUrls.push(url);
                }
            }

            const id = Date.now();
            const review = await Review.create({
                id,
                productId,
                buyerPhone,
                buyerName,
                rating: ratingNum,
                message: message || "",
                images: imageUrls,
                isVerifiedPurchase: false,
                isFake: true,
            });

            await recalculateProductRating(productId);

            res.json({ success: true, review });
        } catch (err) {
            console.error("Add fake review error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ===================== FEATURE 2: CHAT SYSTEM =====================

// POST /chat/start-thread — create a new chat thread between buyer and seller
app.post("/chat/start-thread", async (req, res) => {
    try {
        const { buyerPhone, sellerPhone, productId } = req.body;
        if (!buyerPhone || !sellerPhone) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "buyerPhone and sellerPhone are required",
                });
        }

        // Reuse existing thread for same buyer+seller+product combo
        const existing = await ChatThread.findOne({
            buyerPhone,
            sellerPhone,
            ...(productId ? { productId: Number(productId) } : {}),
        });
        if (existing) {
            return res.json({
                success: true,
                threadId: existing.threadId,
                existing: true,
            });
        }

        const threadId = Date.now();
        const thread = await ChatThread.create({
            threadId,
            buyerPhone,
            sellerPhone,
            productId: productId ? Number(productId) : null,
        });

        res.json({ success: true, threadId: thread.threadId, existing: false });
    } catch (err) {
        console.error("Start thread error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /chat/send — send a message (no order required)
app.post("/chat/send", upload.array("images", 5), async (req, res) => {
    try {
        const {
            threadId,
            orderId,
            senderType,
            senderPhone,
            message,
            productId,
            buyerPhone,
            sellerPhone,
        } = req.body;
        const resolvedThreadId = Number(threadId || orderId);

        if (!resolvedThreadId || !senderType || !senderPhone) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "threadId, senderType and senderPhone are required",
                });
        }
        if (!["buyer", "seller", "admin"].includes(senderType)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "senderType must be buyer, seller or admin",
                });
        }

        const imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const url = await uploadToCloudinary(
                    file.buffer,
                    "delight/chat",
                );
                imageUrls.push(url);
            }
        }

        const id = Date.now();
        const chatMessage = await ChatMessage.create({
            id,
            orderId: resolvedThreadId,
            senderType,
            senderPhone,
            message: message || "",
            images: imageUrls,
            isRead: false,
            productId: productId ? Number(productId) : null,
            buyerPhone: buyerPhone || "",
            sellerPhone: sellerPhone || "",
        });

        res.json({ success: true, message: "Message sent", chatMessage });
    } catch (err) {
        console.error("Chat send error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /chat/threads/:phone — list all chat threads for a buyer or seller
app.get("/chat/threads/:phone", async (req, res) => {
    try {
        const phone = req.params.phone;

        const threads = await ChatThread.find({
            $or: [{ buyerPhone: phone }, { sellerPhone: phone }],
        }).sort({ createdAt: -1 });

        const result = await Promise.all(
            threads.map(async (t) => {
                const lastMsg = await ChatMessage.findOne({
                    orderId: t.threadId,
                }).sort({ createdAt: -1 });
                const unread = await ChatMessage.countDocuments({
                    orderId: t.threadId,
                    senderPhone: { $ne: phone },
                    isRead: false,
                });
                let productInfo = null;
                if (t.productId) {
                    const prod = await Product.findOne({
                        id: t.productId,
                    }).select("id title imageUrls price");
                    productInfo = prod
                        ? {
                              id: prod.id,
                              title: prod.title,
                              image: prod.imageUrls?.[0] || null,
                              price: prod.price,
                          }
                        : null;
                }
                return {
                    threadId: t.threadId,
                    buyerPhone: t.buyerPhone,
                    sellerPhone: t.sellerPhone,
                    productId: t.productId,
                    productInfo,
                    lastMessage: lastMsg || null,
                    unreadCount: unread,
                    createdAt: t.createdAt,
                };
            }),
        );

        res.json({ success: true, count: result.length, threads: result });
    } catch (err) {
        console.error("Chat threads error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /chat/unread/:phone — get total unread message count for a user
app.get("/chat/unread/:phone", async (req, res) => {
    try {
        const phone = req.params.phone;
        const threads = await ChatThread.find({
            $or: [{ sellerPhone: phone }, { buyerPhone: phone }],
        });
        const threadIds = threads.map((t) => t.threadId);
        const count = await ChatMessage.countDocuments({
            orderId: { $in: threadIds },
            senderPhone: { $ne: phone },
            isRead: { $ne: true },
        });
        res.json({ success: true, unreadCount: count, phone });
    } catch (err) {
        console.error("Chat unread error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /chat/:threadId — get all messages in a thread
app.get("/chat/:threadId", async (req, res) => {
    try {
        const orderId = Number(req.params.threadId);
        const messages = await ChatMessage.find({ orderId }).sort({
            createdAt: 1,
        });
        const thread = await ChatThread.findOne({ threadId: orderId });
        res.json({
            success: true,
            count: messages.length,
            messages,
            thread: thread || null,
        });
    } catch (err) {
        console.error("Get chat error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /chat/read/:threadId — mark all messages as read for a given thread
app.put("/chat/read/:threadId", async (req, res) => {
    try {
        const orderId = Number(req.params.threadId);
        const { phone } = req.body;
        const result = await ChatMessage.updateMany(
            { orderId, senderPhone: { $ne: phone }, isRead: { $ne: true } },
            { $set: { isRead: true } },
        );
        res.json({ success: true, markedRead: result.modifiedCount });
    } catch (err) {
        console.error("Chat read error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /seller/chat/:phone — seller dashboard: all customer chat threads
app.get("/seller/chat/:phone", async (req, res) => {
    try {
        const sellerPhone = req.params.phone;

        const threads = await ChatThread.find({ sellerPhone }).sort({
            createdAt: -1,
        });

        const result = await Promise.all(
            threads.map(async (t) => {
                const lastMsg = await ChatMessage.findOne({
                    orderId: t.threadId,
                }).sort({ createdAt: -1 });
                const unread = await ChatMessage.countDocuments({
                    orderId: t.threadId,
                    senderPhone: { $ne: sellerPhone },
                    isRead: { $ne: true },
                });
                let productInfo = null;
                if (t.productId) {
                    const prod = await Product.findOne({
                        id: t.productId,
                    }).select("id title imageUrls price");
                    productInfo = prod
                        ? {
                              id: prod.id,
                              title: prod.title,
                              image: prod.imageUrls?.[0] || null,
                              price: prod.price,
                          }
                        : null;
                }
                return {
                    threadId: t.threadId,
                    buyerPhone: t.buyerPhone,
                    sellerPhone: t.sellerPhone,
                    productInfo,
                    lastMessage: lastMsg || null,
                    unreadCount: unread,
                    createdAt: t.createdAt,
                };
            }),
        );

        res.json({ success: true, count: result.length, threads: result });
    } catch (err) {
        console.error("Seller chat error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/chats — admin gets all active chat threads
app.get("/admin/chats", async (req, res) => {
    try {
        const threads = await ChatMessage.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$orderId",
                    lastMessage: { $first: "$$ROOT" },
                    messageCount: { $sum: 1 },
                },
            },
            { $sort: { "lastMessage.createdAt": -1 } },
        ]);
        res.json({ success: true, count: threads.length, threads });
    } catch (err) {
        console.error("Admin chats error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== FEATURE 3: ADVANCE PAYMENT & SELLER VERIFICATION =====================

// POST /seller/verify-advance-payment — submit verification docs
app.post(
    "/seller/verify-advance-payment",
    upload.fields([
        { name: "cnicFront", maxCount: 1 },
        { name: "cnicBack", maxCount: 1 },
        { name: "selfie", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const {
                sellerPhone,
                cnicNumber,
                bankName,
                accountTitle,
                accountNumber,
                iban,
            } = req.body;

            if (!sellerPhone || !cnicNumber) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "sellerPhone and cnicNumber are required",
                    });
            }

            const seller = await Seller.findOne({ phone: sellerPhone });
            if (!seller) {
                return res
                    .status(404)
                    .json({ success: false, message: "Seller not found" });
            }
            if (seller.plan === "free") {
                return res
                    .status(403)
                    .json({
                        success: false,
                        message:
                            "Only premium or yearly plan sellers can apply for advance payment verification",
                    });
            }

            let cnicFrontImage = "";
            let cnicBackImage = "";
            let selfieImage = "";

            if (req.files?.cnicFront?.[0]) {
                cnicFrontImage = await uploadToCloudinary(
                    req.files.cnicFront[0].buffer,
                    "delight/verification",
                );
            }
            if (req.files?.cnicBack?.[0]) {
                cnicBackImage = await uploadToCloudinary(
                    req.files.cnicBack[0].buffer,
                    "delight/verification",
                );
            }
            if (req.files?.selfie?.[0]) {
                selfieImage = await uploadToCloudinary(
                    req.files.selfie[0].buffer,
                    "delight/verification",
                );
            }

            const verification = await SellerVerification.findOneAndUpdate(
                { sellerPhone },
                {
                    sellerPhone,
                    cnicNumber,
                    cnicFrontImage,
                    cnicBackImage,
                    selfieImage,
                    bankName: bankName || "",
                    accountTitle: accountTitle || "",
                    accountNumber: accountNumber || "",
                    iban: iban || "",
                    status: "pending",
                    adminNotes: "",
                    submittedAt: new Date(),
                    verifiedAt: null,
                },
                { upsert: true, returnDocument: "after" },
            );

            await Seller.findOneAndUpdate(
                { phone: sellerPhone },
                { verificationStatus: "pending" },
            );

            res.json({
                success: true,
                message: "Verification submitted. Admin will review shortly.",
                verification,
            });
        } catch (err) {
            console.error("Seller verify advance payment error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// GET /seller/verification-status/:phone — check verification status
app.get("/seller/verification-status/:phone", async (req, res) => {
    try {
        const seller = await Seller.findOne({ phone: req.params.phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        const verification = await SellerVerification.findOne({
            sellerPhone: req.params.phone,
        });

        res.json({
            success: true,
            verificationStatus: seller.verificationStatus || null,
            advancePaymentEnabled: seller.advancePaymentEnabled || false,
            advancePaymentDeliveryCharge:
                seller.advancePaymentDeliveryCharge || 0,
            verification: verification || null,
        });
    } catch (err) {
        console.error("Verification status error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/verify-seller/:phone — admin approves or rejects verification
app.post("/admin/verify-seller/:phone", async (req, res) => {
    try {
        const { action, adminNotes, advancePaymentDeliveryCharge } = req.body;
        const phone = req.params.phone;

        if (!action || !["approve", "reject"].includes(action)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "action must be 'approve' or 'reject'",
                });
        }

        const verification = await SellerVerification.findOne({
            sellerPhone: phone,
        });
        if (!verification) {
            return res
                .status(404)
                .json({
                    success: false,
                    message: "No verification submission found for this seller",
                });
        }

        const status = action === "approve" ? "approved" : "rejected";

        await SellerVerification.findOneAndUpdate(
            { sellerPhone: phone },
            { status, adminNotes: adminNotes || "", verifiedAt: new Date() },
        );

        const sellerUpdate = { verificationStatus: status };
        if (action === "approve") {
            sellerUpdate.advancePaymentEnabled = true;
            if (advancePaymentDeliveryCharge !== undefined) {
                sellerUpdate.advancePaymentDeliveryCharge = Number(
                    advancePaymentDeliveryCharge,
                );
            }
        }

        await Seller.findOneAndUpdate({ phone }, sellerUpdate);

        res.json({
            success: true,
            message:
                action === "approve"
                    ? "Seller verification approved. Advance payment enabled."
                    : "Seller verification rejected.",
            phone,
            status,
        });
    } catch (err) {
        console.error("Admin verify seller error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/pending-verifications — list all pending verifications
app.get("/admin/pending-verifications", async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : { status: "pending" };
        const verifications = await SellerVerification.find(filter).sort({
            submittedAt: -1,
        });
        res.json({ success: true, count: verifications.length, verifications });
    } catch (err) {
        console.error("Pending verifications error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /seller/advance-payment-status/:phone — get advance payment status
app.get("/seller/advance-payment-status/:phone", async (req, res) => {
    try {
        const seller = await Seller.findOne({ phone: req.params.phone });
        if (!seller) {
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });
        }

        res.json({
            success: true,
            advancePaymentEnabled: seller.advancePaymentEnabled || false,
            verificationStatus: seller.verificationStatus || null,
            advancePaymentDeliveryCharge:
                seller.advancePaymentDeliveryCharge || 0,
            plan: seller.plan || "free",
        });
    } catch (err) {
        console.error("Advance payment status error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- SELLER KYC (ADMIN) ----------------------
// GET /admin/kyc-requests — list sellers with submitted KYC
app.get("/admin/kyc-requests", async (req, res) => {
    try {
        const { status } = req.query; // optional filter: pending | approved | rejected
        const query = { "kyc.businessName": { $exists: true, $ne: null } };
        if (status) query["kyc.status"] = status;

        const sellers = await Seller.find(query).sort({
            "kyc.submittedAt": -1,
        });

        res.json({
            success: true,
            count: sellers.length,
            requests: sellers.map((s) => ({
                sellerId: s.id,
                name: s.name,
                phone: s.phone,
                kyc: {
                    businessName: s.kyc?.businessName || "",
                    phone: s.kyc?.phone || "",
                    cnicFront: s.kyc?.cnicFrontUrl || "",
                    cnicBack: s.kyc?.cnicBackUrl || "",
                    status: s.kyc?.status || "not_submitted",
                    rejectedReason: s.kyc?.rejectedReason || null,
                    submittedAt: s.kyc?.submittedAt || null,
                },
            })),
        });
    } catch (err) {
        console.error("Admin KYC requests error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== PART 1: SELLER KYC ROUTES =====================

// POST /seller/submit-kyc — submit KYC documents
app.post(
    "/seller/submit-kyc",
    upload.fields([
        { name: "cnicFront", maxCount: 1 },
        { name: "cnicBack", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const { sellerPhone, fullName, phoneNumber, cnicNumber } = req.body;

            if (!sellerPhone || !fullName || !phoneNumber || !cnicNumber) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "sellerPhone, fullName, phoneNumber and cnicNumber are required",
                    });
            }
            if (!req.files?.cnicFront?.[0] || !req.files?.cnicBack?.[0]) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "cnicFront and cnicBack images are required",
                    });
            }

            const seller = await Seller.findOne({ phone: sellerPhone });
            if (!seller) {
                return res
                    .status(404)
                    .json({ success: false, message: "Seller not found" });
            }

            const cnicFrontImage = await uploadToCloudinary(
                req.files.cnicFront[0].buffer,
                "delight/kyc",
            );
            const cnicBackImage = await uploadToCloudinary(
                req.files.cnicBack[0].buffer,
                "delight/kyc",
            );

            await SellerVerification.findOneAndUpdate(
                { sellerPhone },
                {
                    sellerPhone,
                    fullName,
                    phoneNumber,
                    cnicNumber,
                    cnicFrontImage,
                    cnicBackImage,
                    status: "pending",
                    adminNotes: "",
                    submittedAt: new Date(),
                    verifiedAt: null,
                },
                { upsert: true, returnDocument: "after" },
            );

            seller.kyc = {
                businessName: fullName,
                phone: phoneNumber,
                cnicFrontUrl: cnicFrontImage,
                cnicBackUrl: cnicBackImage,
                status: "pending",
                submittedAt: new Date(),
            };
            seller.verificationStatus = "pending";
            await seller.save();

            res.json({
                success: true,
                message: "KYC submitted successfully",
                status: "pending",
            });
        } catch (err) {
            console.error("Submit KYC error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// GET /seller/kyc-status/:phone — check KYC status
app.get("/seller/kyc-status/:phone", async (req, res) => {
    try {
        const verification = await SellerVerification.findOne({
            sellerPhone: req.params.phone,
        });
        if (!verification) {
            return res.json({ success: true, status: "not_submitted" });
        }
        res.json({
            success: true,
            status: verification.status,
            fullName: verification.fullName,
            phoneNumber: verification.phoneNumber,
            cnicNumber: verification.cnicNumber,
            cnicFront: verification.cnicFrontImage,
            cnicBack: verification.cnicBackImage,
            adminNotes: verification.adminNotes,
            submittedAt: verification.submittedAt,
            verifiedAt: verification.verifiedAt,
        });
    } catch (err) {
        console.error("KYC status error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/kyc/approve — approve a seller's KYC
app.post("/admin/kyc/approve", async (req, res) => {
    try {
        const { phone, adminNotes } = req.body;
        if (!phone)
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });

        await SellerVerification.findOneAndUpdate(
            { sellerPhone: phone },
            {
                status: "approved",
                adminNotes: adminNotes || "",
                verifiedAt: new Date(),
            },
        );
        await Seller.findOneAndUpdate(
            { phone },
            {
                "kyc.status": "approved",
                verificationStatus: "approved",
                advancePaymentEnabled: true,
            },
        );

        res.json({ success: true, message: "KYC approved" });
    } catch (err) {
        console.error("Admin KYC approve error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/kyc/reject — reject a seller's KYC
app.post("/admin/kyc/reject", async (req, res) => {
    try {
        const { phone, reason } = req.body;
        if (!phone)
            return res
                .status(400)
                .json({ success: false, message: "phone is required" });

        await SellerVerification.findOneAndUpdate(
            { sellerPhone: phone },
            {
                status: "rejected",
                adminNotes: reason || "Rejected by admin.",
                verifiedAt: new Date(),
            },
        );
        await Seller.findOneAndUpdate(
            { phone },
            {
                "kyc.status": "rejected",
                "kyc.rejectedReason": reason || "Rejected by admin.",
                verificationStatus: "rejected",
            },
        );

        res.json({ success: true, message: "KYC rejected" });
    } catch (err) {
        console.error("Admin KYC reject error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/kyc/all — list all KYC submissions
app.get("/admin/kyc/all", async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const verifications = await SellerVerification.find(filter).sort({
            submittedAt: -1,
        });

        const result = await Promise.all(
            verifications.map(async (v) => {
                const seller = await Seller.findOne({
                    phone: v.sellerPhone,
                }).select("name logoUrl");
                return {
                    ...v.toObject(),
                    sellerName: seller?.name || "",
                    sellerLogo: seller?.logoUrl || "",
                };
            }),
        );

        res.json({
            success: true,
            count: result.length,
            verifications: result,
        });
    } catch (err) {
        console.error("Admin KYC all error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== PART 2: PAYMENT SETTINGS =====================

// PUT /seller/update-payment-settings — update easypaisa/jazzcash/advance delivery
app.put(
    "/seller/update-payment-settings",
    upload.fields([
        { name: "easypaisaQr", maxCount: 1 },
        { name: "jazzcashQr", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const { sellerPhone, advanceDelivery, easypaisa, jazzcash } =
                req.body;
            if (!sellerPhone)
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "sellerPhone is required",
                    });

            const seller = await Seller.findOne({ phone: sellerPhone });
            if (!seller)
                return res
                    .status(404)
                    .json({ success: false, message: "Seller not found" });

            if (seller.verificationStatus !== "approved") {
                return res
                    .status(403)
                    .json({
                        success: false,
                        message:
                            "KYC verification required to update payment settings",
                    });
            }

            const update = {};

            if (advanceDelivery !== undefined)
                update.advanceDelivery = Number(advanceDelivery);

            const epData =
                typeof easypaisa === "string"
                    ? JSON.parse(easypaisa)
                    : easypaisa || {};
            const jcData =
                typeof jazzcash === "string"
                    ? JSON.parse(jazzcash)
                    : jazzcash || {};

            update["easypaisa.businessName"] =
                epData.businessName || seller.easypaisa?.businessName || "";
            update["easypaisa.accountNumber"] =
                epData.accountNumber || seller.easypaisa?.accountNumber || "";
            update["jazzcash.businessName"] =
                jcData.businessName || seller.jazzcash?.businessName || "";
            update["jazzcash.accountNumber"] =
                jcData.accountNumber || seller.jazzcash?.accountNumber || "";

            if (req.files?.easypaisaQr?.[0]) {
                update["easypaisa.qrCodeUrl"] = await uploadToCloudinary(
                    req.files.easypaisaQr[0].buffer,
                    "delight/qr",
                );
            }
            if (req.files?.jazzcashQr?.[0]) {
                update["jazzcash.qrCodeUrl"] = await uploadToCloudinary(
                    req.files.jazzcashQr[0].buffer,
                    "delight/qr",
                );
            }

            const updated = await Seller.findOneAndUpdate(
                { phone: sellerPhone },
                update,
                { returnDocument: "after" },
            );

            res.json({
                success: true,
                message: "Payment settings updated",
                easypaisa: updated.easypaisa,
                jazzcash: updated.jazzcash,
                advanceDelivery: updated.advanceDelivery,
            });
        } catch (err) {
            console.error("Update payment settings error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// GET /seller/payment-settings/:phone — get seller payment settings
app.get("/seller/payment-settings/:phone", async (req, res) => {
    try {
        const seller = await Seller.findOne({ phone: req.params.phone });
        if (!seller)
            return res
                .status(404)
                .json({ success: false, message: "Seller not found" });

        res.json({
            success: true,
            easypaisa: seller.easypaisa || {},
            jazzcash: seller.jazzcash || {},
            advanceDelivery: seller.advanceDelivery || 0,
            kycApproved: seller.verificationStatus === "approved",
        });
    } catch (err) {
        console.error("Get payment settings error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================== PART 3: BUYER PAYMENT + INVOICE =====================

// POST /payment/submit — buyer submits payment proof
app.post("/payment/submit", upload.single("screenshot"), async (req, res) => {
    try {
        const {
            buyerName,
            buyerPhone,
            sellerPhone,
            orderId,
            amount,
            paymentMethod,
            transactionId,
        } = req.body;

        if (
            !buyerName ||
            !buyerPhone ||
            !sellerPhone ||
            !orderId ||
            !amount ||
            !paymentMethod ||
            !transactionId
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "All fields are required: buyerName, buyerPhone, sellerPhone, orderId, amount, paymentMethod, transactionId",
                });
        }
        if (!["easypaisa", "jazzcash"].includes(paymentMethod)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "paymentMethod must be easypaisa or jazzcash",
                });
        }

        const duplicate = await BuyerPayment.findOne({ transactionId });
        if (duplicate) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Transaction ID already used",
                });
        }

        let screenshotUrl = "";
        if (req.file) {
            screenshotUrl = await uploadToCloudinary(
                req.file.buffer,
                "delight/payment-proofs",
            );
        }

        const id = Date.now();
        await BuyerPayment.create({
            id,
            buyerName,
            buyerPhone,
            sellerPhone,
            orderId: Number(orderId),
            amount: Number(amount),
            paymentMethod,
            transactionId,
            screenshotUrl,
            status: "pending",
            submittedAt: new Date(),
        });

        await Order.findOneAndUpdate(
            { id: Number(orderId) },
            { paymentStatus: "submitted", paymentTransactionId: transactionId },
        );

        res.json({
            success: true,
            message: "Payment submitted successfully",
            paymentId: id,
            invoiceUrl: `/invoice/${id}`,
        });
    } catch (err) {
        console.error("Payment submit error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /invoice/:paymentId — get invoice for a payment
app.get("/invoice/:paymentId", async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        const payment = await BuyerPayment.findOne({ id: paymentId });
        if (!payment)
            return res
                .status(404)
                .json({ success: false, message: "Payment not found" });

        const [order, seller] = await Promise.all([
            Order.findOne({ id: payment.orderId }),
            Seller.findOne({ phone: payment.sellerPhone }),
        ]);

        res.json({
            success: true,
            invoice: {
                invoiceNumber: `INV-${paymentId}`,
                paymentId,
                status: payment.status,
                buyer: { name: payment.buyerName, phone: payment.buyerPhone },
                seller: {
                    name: seller?.name || "",
                    phone: payment.sellerPhone,
                    logo: seller?.logoUrl || "",
                },
                order: order
                    ? {
                          id: order.id,
                          product: order.productData,
                          address: order.address,
                          createdAt: order.createdAt,
                      }
                    : null,
                payment: {
                    method: payment.paymentMethod,
                    transactionId: payment.transactionId,
                    amount: payment.amount,
                    screenshotUrl: payment.screenshotUrl,
                    submittedAt: payment.submittedAt,
                },
            },
        });
    } catch (err) {
        console.error("Invoice error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /seller/payments/:phone — all payments for a seller
app.get("/seller/payments/:phone", async (req, res) => {
    try {
        const payments = await BuyerPayment.find({
            sellerPhone: req.params.phone,
        }).sort({ submittedAt: -1 });
        res.json({ success: true, count: payments.length, payments });
    } catch (err) {
        console.error("Seller payments error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /buyer/payments/:phone — all payments by a buyer
app.get("/buyer/payments/:phone", async (req, res) => {
    try {
        const payments = await BuyerPayment.find({
            buyerPhone: req.params.phone,
        }).sort({ submittedAt: -1 });
        res.json({ success: true, count: payments.length, payments });
    } catch (err) {
        console.error("Buyer payments error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/payment/verify — admin approves or rejects a buyer payment
app.post("/admin/payment/verify", async (req, res) => {
    try {
        const { paymentId, action } = req.body;
        if (!paymentId || !action)
            return res
                .status(400)
                .json({
                    success: false,
                    message: "paymentId and action are required",
                });
        if (!["approve", "reject"].includes(action))
            return res
                .status(400)
                .json({
                    success: false,
                    message: "action must be approve or reject",
                });

        const newStatus = action === "approve" ? "verified" : "rejected";
        const payment = await BuyerPayment.findOneAndUpdate(
            { id: Number(paymentId) },
            { status: newStatus },
            { returnDocument: "after" },
        );
        if (!payment)
            return res
                .status(404)
                .json({ success: false, message: "Payment not found" });

        if (action === "approve") {
            await Order.findOneAndUpdate(
                { id: payment.orderId },
                { paymentStatus: "verified", status: "Processing" },
            );
        }

        res.json({
            success: true,
            message: `Payment ${newStatus}`,
            paymentId: payment.id,
            status: newStatus,
        });
    } catch (err) {
        console.error("Admin payment verify error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------- ERROR HANDLING ----------------------
app.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            message: "File too large. Maximum allowed size is 100MB.",
        });
    }
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: err.message });
});

// ---------------------- START ----------------------
const PORT = process.env.PORT || 80;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server Running Smoothly on port ${PORT}`);
    console.log(
        `☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? "✅ Configured" : "❌ NOT SET"}`,
    );
});
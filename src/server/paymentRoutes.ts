import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  requireAdminAuth,
  paymentLimiter,
  logSecurityEvent,
  isValidPhone,
  isValidEmail,
  sanitizeString,
  maskSensitive,
  escapeHtml
} from "./security.js";

export const PRIMARY_OWNER_EMAIL = "joshuaocansey731@gmail.com";
export const OWNER_EMAILS = [
  "joshuaocansey731@gmail.com",
  "joshuaocansey66@gmail.com"
];
export const RECIPIENT_PHONE = "0507553110";
export const RECIPIENT_NAME = "Joshua Ocansey";
export const RECIPIENT_NETWORK = "Telecel Cash (Vodafone Cash)";
export const MOMO_AMOUNT_GHS = 15;

export interface GhanaTransaction {
  id: string;
  userId: string;
  userEmail: string;
  userPhone: string;
  network: "mtn" | "telecel" | "at";
  recipientPhone: string;
  recipientName: string;
  amountGhs: number;
  reference: string;
  unlockCode: string;
  approveToken: string;
  rejectToken: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "ghana_transactions.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create data directory:", err);
  }
}

const STATS_FILE = path.join(DATA_DIR, "platform_stats.json");

interface PlatformStats {
  totalUsers: number;
  minUsersForPaywall: number;
  adminOverridePaywall: boolean;
  ghanaOnly: boolean;
}

let platformStats: PlatformStats = {
  totalUsers: 1,
  minUsersForPaywall: 500,
  adminOverridePaywall: false,
  ghanaOnly: true,
};

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, "utf-8");
      platformStats = { ...platformStats, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error("Error loading platform stats from disk:", err);
  }
}

function persistStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(platformStats, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving platform stats to disk:", err);
  }
}

// In-memory cache synced with JSON file
const transactions = new Map<string, GhanaTransaction>();

function loadTransactions() {
  try {
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const raw = fs.readFileSync(TRANSACTIONS_FILE, "utf-8");
      const list: GhanaTransaction[] = JSON.parse(raw);
      list.forEach(tx => transactions.set(tx.id, tx));
    }
  } catch (err) {
    console.error("Error loading transactions from disk:", err);
  }
}

function persistTransactions() {
  try {
    const list = Array.from(transactions.values());
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving transactions to disk:", err);
  }
}

// Load initial transactions and stats
loadTransactions();
loadStats();

// Setup Nodemailer Transporter (Supports Gmail App Password or custom SMTP)
let transporter: nodemailer.Transporter | null = null;
let transporterChecked = false;

function getTransporter(): nodemailer.Transporter | null {
  if (!transporterChecked) {
    transporterChecked = true;
    if (process.env.GMAIL_USER && (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS)) {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS,
        },
      });
      console.log(`[Email] Configured direct Gmail SMTP for: ${process.env.GMAIL_USER}`);
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log(`[Email] Configured custom SMTP host: ${process.env.SMTP_HOST}`);
    } else {
      console.log(`[Email] No direct SMTP credentials found. Using HTTP Webhook / FormSubmit mail gateway.`);
    }
  }
  return transporter;
}

// Send email notification to app owner (both joshuaocansey731@gmail.com and joshuaocansey66@gmail.com)
async function sendPaymentNotificationEmail(tx: GhanaTransaction, baseUrl: string) {
  const approveUrl = `${baseUrl}/api/payment/verify?id=${tx.id}&token=${tx.approveToken}&action=approve`;
  const rejectUrl = `${baseUrl}/api/payment/verify?id=${tx.id}&token=${tx.rejectToken}&action=reject`;

  const networkNames: Record<string, string> = {
    mtn: "MTN Mobile Money",
    telecel: "Telecel Cash (Vodafone)",
    at: "AirtelTigo / AT Money",
  };
  const networkDisplay = networkNames[tx.network] || tx.network.toUpperCase();

  const emailSubject = `🔔 Ghana MoMo Payment: GH₵ ${tx.amountGhs}.00 from ${tx.userPhone} (${networkDisplay})`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 20px; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; color: #e2e8f0;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); padding: 28px 24px; text-align: center; border-bottom: 1px solid #1e293b;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">GlobalNews.site</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #93c5fd; font-weight: 600;">GHANA MOBILE MONEY PAYMENT RECEIVED</p>
        </div>

        <div style="padding: 28px 24px;">
          <p style="margin-top: 0; font-size: 15px; line-height: 1.5; color: #cbd5e1;">
            Hello <strong>Joshua</strong>,<br/><br/>
            A customer in Ghana has paid and tapped on <strong>Pay</strong> for their 30-Day VIP Pass:
          </p>

          <div style="background: #0f172a; border: 1px solid #27354f; border-radius: 14px; padding: 18px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #cbd5e1;">
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Amount Paid:</td>
                <td style="padding: 6px 0; font-weight: 800; color: #22c55e; font-size: 20px; text-align: right;">GH₵ ${tx.amountGhs}.00</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Recipient Wallet:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${escapeHtml(tx.recipientPhone)} (${escapeHtml(tx.recipientName)})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Customer Phone:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #38bdf8; font-size: 16px; text-align: right;">${escapeHtml(tx.userPhone)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Network:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #ffffff; text-align: right;">${escapeHtml(networkDisplay)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Customer Email:</td>
                <td style="padding: 6px 0; color: #cbd5e1; text-align: right;">${escapeHtml(tx.userEmail)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94a3b8;">Reference / Note:</td>
                <td style="padding: 6px 0; font-family: monospace; color: #f8fafc; text-align: right;">${escapeHtml(tx.reference || "None provided")}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0 0; color: #94a3b8; border-top: 1px solid #1e293b;">6-Digit Manual Unlock PIN:</td>
                <td style="padding: 8px 0 0; font-weight: 800; font-size: 22px; color: #fbbf24; text-align: right; letter-spacing: 2px; border-top: 1px solid #1e293b;">${escapeHtml(tx.unlockCode)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 14px; color: #e2e8f0; font-weight: 600; margin-bottom: 18px; text-align: center;">
            Did you receive GH₵ ${tx.amountGhs}.00 on your phone (${tx.recipientPhone})?
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${approveUrl}" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 16px 30px; border-radius: 12px; font-weight: 800; font-size: 16px; display: inline-block; margin: 6px; box-shadow: 0 4px 14px rgba(22,163,74,0.4);">
              ✅ Yes, I Received It (Unlock User Now)
            </a>
            <br/>
            <a href="${rejectUrl}" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; margin: 6px;">
              ❌ Not Received (Decline)
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center; margin-top: 24px;">
            The customer's screen is currently active and waiting for your confirmation.<br/>
            Clicking <strong>"Yes, I Received It"</strong> immediately unlocks their 30-Day VIP Pass on their device.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Send via direct SMTP if configured
  const mailer = getTransporter();
  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"Global News MoMo Guard" <no-reply@globalnews.site>`,
        to: OWNER_EMAILS.join(", "),
        subject: emailSubject,
        html: htmlContent,
      });
      console.log(`[Email] Direct SMTP notification sent successfully to: ${OWNER_EMAILS.join(", ")}`);
    } catch (smtpErr) {
      console.error("[Email] Direct SMTP error:", smtpErr);
    }
  }

  // 2. Multi-channel delivery to FormSubmit to reach Joshua's Gmail inbox immediately
  for (const email of OWNER_EMAILS) {
    try {
      fetch(`https://formsubmit.co/ajax/${email}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Referer": baseUrl,
          "Origin": baseUrl,
          "User-Agent": "Mozilla/5.0 (GlobalNews MoMo Dispatcher)"
        },
        body: JSON.stringify({
          _subject: `🔔 Ghana MoMo Payment: GH₵ ${tx.amountGhs}.00 from ${tx.userPhone} (${networkDisplay})`,
          Customer_Phone: tx.userPhone,
          Network: networkDisplay,
          Amount: `GH₵ ${tx.amountGhs}.00`,
          Sent_To_Wallet: `${tx.recipientPhone} (${tx.recipientName})`,
          Customer_Email: tx.userEmail,
          Reference: tx.reference || "None",
          Manual_Unlock_PIN: tx.unlockCode,
          One_Click_Approve: approveUrl,
          Decline: rejectUrl,
          Instruction: "Click One_Click_Approve above to instantly activate the user's 30-Day VIP Pass on their screen."
        })
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        console.log(`[Email] FormSubmit dispatch to ${email}: status ${res.status}`, data);
      }).catch(err => {
        console.error(`[Email] FormSubmit dispatch error for ${email}:`, err);
      });
    } catch (e) {
      console.error(`[Email] Failed to dispatch to ${email}:`, e);
    }
  }

  console.log("==================================================");
  console.log(`📧 INSTANT PAYMENT NOTIFICATION DISPATCHED TO:`);
  OWNER_EMAILS.forEach(e => console.log(`   - ${e}`));
  console.log(`   Customer: ${tx.userPhone} (${networkDisplay}) - ${tx.userEmail}`);
  console.log(`   Amount: GH₵ ${tx.amountGhs}.00 -> ${tx.recipientPhone}`);
  console.log(`   6-Digit PIN: ${tx.unlockCode}`);
  console.log(`   👉 ONE-CLICK APPROVE LINK: ${approveUrl}`);
  console.log(`   👉 DECLINE LINK: ${rejectUrl}`);
  console.log("==================================================");
}

export const paymentRouter = Router();

paymentRouter.use("/api/payment", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

// 1. INITIATE PAYMENT (Rate limited & strictly validated)
paymentRouter.post("/api/payment/ghana-initiate", paymentLimiter, async (req: Request, res: Response) => {
  try {
    const { userPhone, network, userEmail, userId, reference } = req.body || {};

    if (!userPhone || !network || !userEmail) {
      return res.status(400).json({ error: "Missing required fields: userPhone, network, userEmail" });
    }

    if (!isValidPhone(userPhone)) {
      return res.status(400).json({ error: "Invalid phone number format. Must be between 9 and 15 digits." });
    }

    if (!isValidEmail(userEmail)) {
      return res.status(400).json({ error: "Invalid email address format." });
    }

    // Clean phone number
    const cleanPhone = String(userPhone).replace(/[^0-9+]/g, "").slice(0, 15);
    const cleanRef = sanitizeString(reference, 60);
    const validNetwork = network === "mtn" || network === "telecel" || network === "at" ? network : "telecel";

    // Generate unique transaction ID & tokens
    const id = `momo_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const approveToken = crypto.randomBytes(16).toString("hex");
    const rejectToken = crypto.randomBytes(16).toString("hex");
    const unlockCode = Math.floor(100000 + Math.random() * 900000).toString();

    const newTx: GhanaTransaction = {
      id,
      userId: sanitizeString(userId, 64) || "guest_" + Date.now(),
      userEmail: String(userEmail).trim().toLowerCase().slice(0, 100),
      userPhone: cleanPhone,
      network: validNetwork,
      recipientPhone: RECIPIENT_PHONE,
      recipientName: RECIPIENT_NAME,
      amountGhs: MOMO_AMOUNT_GHS,
      reference: cleanRef,
      unlockCode,
      approveToken,
      rejectToken,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    transactions.set(id, newTx);
    persistTransactions();

    logSecurityEvent("PAYMENT_INITIATED", {
      txId: id,
      phone: cleanPhone,
      email: newTx.userEmail,
      amount: MOMO_AMOUNT_GHS,
      ip: req.ip,
    }, "info");

    // Optional Paystack Direct MoMo STK Push (if PAYSTACK_SECRET_KEY is configured)
    if (process.env.PAYSTACK_SECRET_KEY) {
      try {
        const paystackRes = await fetch("https://api.paystack.co/charge", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: newTx.userEmail,
            amount: MOMO_AMOUNT_GHS * 100, // in pesewas
            currency: "GHS",
            mobile_money: {
              phone: cleanPhone,
              provider: validNetwork === "mtn" ? "mtn" : validNetwork === "telecel" ? "vod" : "tgo"
            }
          })
        });
        const psData = await paystackRes.json().catch(() => ({}));
        console.log("[Paystack MoMo STK Push Triggered]:", psData);
      } catch (psErr) {
        console.warn("[Paystack Push Warning]:", psErr);
      }
    }

    // Determine host base URL for email links
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    // Send email notification to app owner (both joshuaocansey731@gmail.com and joshuaocansey66@gmail.com)
    sendPaymentNotificationEmail(newTx, baseUrl).catch(console.error);

    // Return to client WITHOUT showing owner's personal phone number
    return res.json({
      success: true,
      transactionId: id,
      status: "pending",
      merchantName: "Global News",
      userPhone: cleanPhone,
      network: validNetwork,
      promptTriggered: true,
      amountGhs: MOMO_AMOUNT_GHS,
      amountFormatted: `GH₵ ${MOMO_AMOUNT_GHS}.00`,
      message: "Payment prompt triggered! Please check your phone screen and enter your Mobile Money PIN.",
    });
  } catch (err: any) {
    console.error("Error initiating Ghana MoMo payment:", err);
    return res.status(500).json({ error: "Failed to initiate payment." });
  }
});

// 2. CHECK STATUS (Used by front-end polling / modal listener)
paymentRouter.get("/api/payment/status", (req: Request, res: Response) => {
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing transaction id" });
  }

  const tx = transactions.get(id);
  if (!tx) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  return res.json({
    id: tx.id,
    status: tx.status,
    amountGhs: tx.amountGhs,
    approvedAt: tx.approvedAt,
    rejectedAt: tx.rejectedAt,
  });
});

// 3. OWNER ONE-CLICK EMAIL CONFIRMATION LINK (GET route clicked by Joshua from email)
paymentRouter.get("/api/payment/verify", (req: Request, res: Response) => {
  const { id, token, action } = req.query;

  if (!id || typeof id !== "string" || !token || typeof token !== "string") {
    return res.status(400).send("Invalid verification request.");
  }

  const tx = transactions.get(id);
  if (!tx) {
    return res.status(404).send("Transaction not found or expired.");
  }

  const isApprove = action === "approve" && token === tx.approveToken;
  const isReject = action === "reject" && token === tx.rejectToken;

  if (!isApprove && !isReject) {
    return res.status(403).send("Invalid or expired verification token.");
  }

  if (isApprove) {
    tx.status = "approved";
    tx.approvedAt = new Date().toISOString();
    persistTransactions();

    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Confirmed - GlobalNews.site</title>
        <style>
          body { margin: 0; padding: 24px; background: #0a0a0a; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
          .card { background: #161616; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 40px 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          .icon { width: 68px; height: 68px; background: rgba(34,197,94,0.15); border: 2px solid rgba(34,197,94,0.3); color: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 32px; font-weight: bold; }
          h2 { margin: 0 0 12px; font-size: 24px; font-weight: 800; }
          p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
          .info { background: #1f1f1f; border-radius: 16px; padding: 16px; text-align: left; font-size: 13px; margin-bottom: 24px; }
          .info div { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info div:last-child { margin-bottom: 0; }
          .label { color: #71717a; }
          .val { font-weight: 600; color: #ffffff; }
          .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 14px; font-weight: 700; font-size: 14px; transition: background 0.2s; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h2>Payment Confirmed!</h2>
          <p>
            You have successfully confirmed receipt of <strong>GH₵ ${tx.amountGhs}.00</strong> on <strong>${tx.recipientPhone}</strong>.<br/><br/>
            The user's app screen has been immediately unlocked with full 30-Day VIP access.
          </p>
          <div class="info">
            <div><span class="label">Customer Phone:</span><span class="val">${escapeHtml(tx.userPhone)}</span></div>
            <div><span class="label">Customer Email:</span><span class="val">${escapeHtml(tx.userEmail)}</span></div>
            <div><span class="label">Amount Received:</span><span class="val" style="color:#22c55e;">GH₵ ${tx.amountGhs}.00</span></div>
            <div><span class="label">Wallet:</span><span class="val">${escapeHtml(tx.recipientPhone)}</span></div>
          </div>
          <a href="/" class="btn">Return to Global News</a>
        </div>
      </body>
      </html>
    `);
  } else {
    tx.status = "rejected";
    tx.rejectedAt = new Date().toISOString();
    persistTransactions();

    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Declined - GlobalNews.site</title>
        <style>
          body { margin: 0; padding: 24px; background: #0a0a0a; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
          .card { background: #161616; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 40px 32px; max-width: 440px; text-align: center; }
          .icon { width: 68px; height: 68px; background: rgba(239,68,68,0.15); border: 2px solid rgba(239,68,68,0.3); color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 32px; font-weight: bold; }
          h2 { margin: 0 0 12px; font-size: 24px; }
          p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
          .btn { display: inline-block; background: #374151; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✕</div>
          <h2>Payment Marked as Declined</h2>
          <p>The transaction from <strong>${escapeHtml(tx.userPhone)}</strong> has been declined because the money was not received on 0507553110.</p>
          <a href="/" class="btn">Return to App</a>
        </div>
      </body>
      </html>
    `);
  }
});

// 4. VERIFY 6-DIGIT CODE (Rate limited to prevent brute force; Check 12)
paymentRouter.post("/api/payment/verify-code", paymentLimiter, (req: Request, res: Response) => {
  const { transactionId, code } = req.body || {};
  if (!transactionId || !code) {
    return res.status(400).json({ error: "transactionId and code are required." });
  }

  const tx = transactions.get(String(transactionId));
  if (!tx) {
    return res.status(404).json({ error: "Transaction not found." });
  }

  const cleanCode = String(code).trim();
  // Ensure exactly 6 digits
  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: "Code must be a 6-digit numeric PIN." });
  }

  if (cleanCode === tx.unlockCode) {
    tx.status = "approved";
    tx.approvedAt = new Date().toISOString();
    persistTransactions();

    logSecurityEvent("PAYMENT_CODE_VERIFIED_SUCCESS", {
      txId: tx.id,
      phone: tx.userPhone,
      email: tx.userEmail,
      ip: req.ip,
    }, "info");

    return res.json({ success: true, message: "Code verified. Access unlocked!" });
  }

  logSecurityEvent("PAYMENT_CODE_VERIFICATION_FAILED", {
    txId: tx.id,
    ip: req.ip,
  }, "warn");

  return res.status(400).json({ error: "Invalid 6-digit confirmation code. Please check and try again." });
});

// 5. ADMIN LIST TRANSACTIONS (Locked down with Check 01 & Check 09 server-side auth)
paymentRouter.get("/api/payment/admin/transactions", requireAdminAuth, (_req: Request, res: Response) => {
  const list = Array.from(transactions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return res.json(list);
});

// 6. ADMIN DIRECT ACTION (Locked down with Check 01 & Check 09 server-side auth)
paymentRouter.post("/api/payment/admin/action", requireAdminAuth, (req: Request, res: Response) => {
  const { transactionId, action } = req.body || {};
  if (!transactionId || !action) {
    return res.status(400).json({ error: "transactionId and action are required." });
  }

  const tx = transactions.get(String(transactionId));
  if (!tx) {
    return res.status(404).json({ error: "Transaction not found." });
  }

  if (action === "approve") {
    tx.status = "approved";
    tx.approvedAt = new Date().toISOString();
    persistTransactions();

    logSecurityEvent("ADMIN_PAYMENT_APPROVED", {
      txId: tx.id,
      amount: tx.amountGhs,
      userPhone: tx.userPhone,
    }, "info");

    return res.json({ success: true, transaction: tx });
  } else if (action === "reject") {
    tx.status = "rejected";
    tx.rejectedAt = new Date().toISOString();
    persistTransactions();

    logSecurityEvent("ADMIN_PAYMENT_REJECTED", {
      txId: tx.id,
      userPhone: tx.userPhone,
    }, "info");

    return res.json({ success: true, transaction: tx });
  }

  return res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
});

// 7. PLATFORM STATUS & MONETIZATION THRESHOLD API
// Subscriptions are strictly hidden until total users >= 500, and payments are visible in GHANA ONLY.
paymentRouter.get("/api/platform-status", async (req: Request, res: Response) => {
  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "";
  
  let country = (req.headers["cf-ipcountry"] as string) || (req.headers["x-country-code"] as string) || "";
  if (!country && clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1" && !clientIp.startsWith("10.") && !clientIp.startsWith("192.168.")) {
    try {
      const geoRes = await fetch(`https://api.country.is/${clientIp}`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        country = geoData.country || "";
      }
    } catch {
      // fallback smoothly
    }
  }

  const isGhana = country.toUpperCase() === "GH";
  const isThresholdReached = platformStats.totalUsers >= platformStats.minUsersForPaywall;
  const isMonetizationActive = (isThresholdReached || platformStats.adminOverridePaywall) && isGhana;

  return res.json({
    totalUsers: platformStats.totalUsers,
    minUsersForPaywall: platformStats.minUsersForPaywall,
    isThresholdReached,
    clientIp,
    country,
    isGhana,
    isMonetizationActive,
    adminOverridePaywall: platformStats.adminOverridePaywall
  });
});

paymentRouter.post("/api/platform-status/sync", (req: Request, res: Response) => {
  const { count } = req.body;
  if (typeof count === "number" && count >= 0) {
    if (count > platformStats.totalUsers) {
      platformStats.totalUsers = Math.min(1000000, count);
      persistStats();
    }
  }
  return res.json({ success: true, stats: platformStats });
});

paymentRouter.post("/api/platform-status/record-signup", (_req: Request, res: Response) => {
  platformStats.totalUsers += 1;
  persistStats();
  return res.json({ success: true, totalUsers: platformStats.totalUsers });
});

paymentRouter.post("/api/platform-status/admin-override", requireAdminAuth, (req: Request, res: Response) => {
  const { override } = req.body;
  if (typeof override === "boolean") {
    platformStats.adminOverridePaywall = override;
    persistStats();
    logSecurityEvent("ADMIN_PAYWALL_OVERRIDE_CHANGED", { override }, "info");
  }
  return res.json({ success: true, stats: platformStats });
});


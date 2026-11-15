import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { URL } from "url";
import crypto from "crypto";

// ============================================================================
// ADMIN EMAILS & SECRETS
// ============================================================================
export const OWNER_EMAILS = [
  "joshuaocansey731@gmail.com",
  "joshuaocansey66@gmail.com",
];

// Fallback admin secret generated per server lifecycle if not provided via env
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || crypto.randomBytes(32).toString("hex");

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return OWNER_EMAILS.some((admin) => admin.toLowerCase() === normalized);
}

// ============================================================================
// CHECK 08: STRUCTURED SECURITY LOGGING (REDACTING SENSITIVE DATA)
// ============================================================================
export function maskSensitive(text?: string | null): string {
  if (!text) return "";
  const s = String(text).trim();
  if (s.includes("@")) {
    const parts = s.split("@");
    const name = parts[0];
    const domain = parts[1] || "";
    const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : `${name}***`;
    return `${maskedName}@${domain}`;
  }
  if (s.length >= 8) {
    return `${s.slice(0, 3)}****${s.slice(-2)}`;
  }
  return "***";
}

export function logSecurityEvent(
  eventType: string,
  details: Record<string, any>,
  level: "info" | "warn" | "error" = "info"
) {
  const sanitizedDetails = { ...details };
  // Redact common secret / PII keys
  const sensitiveKeys = ["token", "password", "unlockCode", "secret", "apiKey", "pass"];
  for (const key of Object.keys(sanitizedDetails)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitizedDetails[key] = "[REDACTED]";
    } else if (key.toLowerCase().includes("email")) {
      sanitizedDetails[key] = maskSensitive(sanitizedDetails[key]);
    } else if (key.toLowerCase().includes("phone")) {
      sanitizedDetails[key] = maskSensitive(sanitizedDetails[key]);
    }
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    type: `SECURITY_${eventType.toUpperCase()}`,
    ...sanitizedDetails,
  };

  if (level === "error") {
    console.error("[SECURITY_AUDIT]", JSON.stringify(logEntry));
  } else if (level === "warn") {
    console.warn("[SECURITY_AUDIT]", JSON.stringify(logEntry));
  } else {
    console.log("[SECURITY_AUDIT]", JSON.stringify(logEntry));
  }
}

// ============================================================================
// BONUS B2: SERVER-SIDE REQUEST FORGERY (SSRF) PROTECTION
// ============================================================================
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS / GCP metadata IP
  /^metadata\.google\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

export function isSafePublicUrl(rawUrl: string): { safe: boolean; reason?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(rawUrl);

    // Only allow HTTP and HTTPS protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Check against blocked IP / local host patterns
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: `Prohibited internal/private target host: ${hostname}` };
      }
    }

    // Prohibit credentials embedded in URL
    if (parsed.username || parsed.password) {
      return { safe: false, reason: "URLs with embedded credentials are not permitted." };
    }

    // Prohibit dangerous ports
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (![80, 443, 8080, 8443].includes(portNum)) {
        return { safe: false, reason: `Disallowed non-standard port: ${portNum}` };
      }
    }

    return { safe: true, parsedUrl: parsed };
  } catch (err: any) {
    return { safe: false, reason: "Invalid URL string format." };
  }
}

// ============================================================================
// CHECK 01 & CHECK 09: ADMIN ROUTE LOCKDOWN & AUTHENTICATION
// ============================================================================
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const adminEmailHeader = (req.headers["x-admin-email"] as string) || "";
  const adminSecretHeader = (req.headers["x-admin-secret"] as string) || "";

  // Check secret bypass (e.g. CLI or internal cron)
  if (adminSecretHeader && adminSecretHeader === ADMIN_API_SECRET) {
    return next();
  }

  // Check email in headers or Bearer token payload
  if (isAuthorizedAdminEmail(adminEmailHeader)) {
    return next();
  }

  // Check bearer token / email token if provided
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    // In our client-server setup, if token matches authorized email or secret
    if (isAuthorizedAdminEmail(token) || token === ADMIN_API_SECRET) {
      return next();
    }
  }

  // Check session body for administrative operations
  const bodyEmail = req.body?.adminEmail || req.query?.adminEmail;
  if (bodyEmail && isAuthorizedAdminEmail(String(bodyEmail))) {
    return next();
  }

  logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT", {
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    method: req.method,
  }, "warn");

  return res.status(403).json({
    error: "Access denied. Administrator privileges required.",
    code: "ADMIN_AUTH_REQUIRED",
  });
}

// ============================================================================
// CHECK 12: RATE LIMITERS (COST CONTROL & BRUTE FORCE DEFENSE)
// ============================================================================

// Global general API rate limiter: 120 requests / minute
export const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down.", code: "RATE_LIMITED" },
});

// AI & Expensive Generation Limiter: 15 requests / minute
export const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Generation rate limit reached. Please wait a minute before requesting more videos or AI scripts.",
    code: "GENERATION_RATE_LIMITED",
  },
  handler: (req, res, _next, options) => {
    logSecurityEvent("RATE_LIMIT_HIT", {
      path: req.path,
      ip: req.ip,
      limit: options.limit,
    }, "warn");
    res.status(429).json(options.message);
  },
});

// Payment & Verification Limiter: 20 attempts / minute (protects 6-digit codes)
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many payment verification attempts. Please wait 1 minute before trying again.",
    code: "PAYMENT_RATE_LIMITED",
  },
  handler: (req, res, _next, options) => {
    logSecurityEvent("PAYMENT_BRUTE_FORCE_THROTTLE", {
      path: req.path,
      ip: req.ip,
    }, "warn");
    res.status(429).json(options.message);
  },
});

// SSRF / Proxy Limiter: 40 requests / minute
export const proxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Proxy request limit reached.", code: "PROXY_RATE_LIMITED" },
});

// ============================================================================
// CHECK 23: BLOCK EXPOSED FILES & PATH TRAVERSAL
// ============================================================================
const DANGEROUS_FILE_EXTENSIONS = [
  ".env",
  ".env.example",
  ".env.local",
  ".git",
  ".json",
  ".ts",
  ".tsx",
  ".cjs",
  ".mjs",
  ".sh",
  ".lock",
  ".sql",
  ".bak",
  ".log",
  ".zip",
  ".tar",
  ".gz",
];

export function blockSensitiveFileRequests(req: Request, res: Response, next: NextFunction) {
  const urlPath = req.path.toLowerCase();
  const isProd = process.env.NODE_ENV === "production";
  const isViteTransformQuery =
    req.query.import !== undefined ||
    req.query.t !== undefined ||
    req.query.html !== undefined;

  // Block any dotfiles (except Vite internal paths like /.vite/ in dev)
  if ((urlPath.includes("/.") || urlPath.startsWith("/.")) && (isProd || !urlPath.startsWith("/.vite/"))) {
    logSecurityEvent("DOTFILE_ACCESS_BLOCKED", { path: req.path, ip: req.ip }, "warn");
    return res.status(404).send("Not Found");
  }

  // Always block sensitive server/config/data files
  if (
    urlPath.startsWith("/data") ||
    urlPath.startsWith("/server.ts") ||
    urlPath.startsWith("/scripts") ||
    urlPath.startsWith("/node_modules") ||
    urlPath === "/package.json" ||
    urlPath === "/package-lock.json" ||
    urlPath === "/tsconfig.json" ||
    urlPath === "/firestore.rules" ||
    urlPath === "/security_map.md" ||
    urlPath === "/security_report.md" ||
    urlPath === "/security_review.md" ||
    (urlPath === "/firebase-applet-config.json" && (isProd || !isViteTransformQuery))
  ) {
    logSecurityEvent("INTERNAL_FILE_PROBE_BLOCKED", { path: req.path, ip: req.ip }, "warn");
    return res.status(404).send("Not Found");
  }

  // In production, block /src/ entirely (compiled assets are served from dist)
  if (isProd && urlPath.startsWith("/src/")) {
    logSecurityEvent("INTERNAL_FILE_PROBE_BLOCKED", { path: req.path, ip: req.ip }, "warn");
    return res.status(404).send("Not Found");
  }

  // Block dangerous file extensions (allow Vite dev transforms for .ts/.tsx in non-production)
  if (
    DANGEROUS_FILE_EXTENSIONS.some((ext) => {
      if (!urlPath.endsWith(ext) || urlPath.startsWith("/manifest.json")) return false;
      if (!isProd && (ext === ".ts" || ext === ".tsx")) return false;
      if (!isProd && ext === ".json" && isViteTransformQuery) return false;
      return true;
    })
  ) {
    return res.status(404).send("Not Found");
  }

  next();
}

// ============================================================================
// CHECK 06: INPUT VALIDATION HELPERS
// ============================================================================
export function sanitizeString(input: unknown, maxLength = 255): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function isValidPhone(phone: unknown): boolean {
  if (typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

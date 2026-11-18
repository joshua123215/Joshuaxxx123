import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import Parser from "rss-parser";
import { GoogleGenAI } from "@google/genai";
import helmet from "helmet";
import { paymentRouter } from "./src/server/paymentRoutes.js";
import { automationRouter } from "./src/server/automationRoutes.js";
import {
  isSafePublicUrl,
  blockSensitiveFileRequests,
  apiGeneralLimiter,
  proxyLimiter,
  aiGenerationLimiter,
  logSecurityEvent,
  sanitizeString
} from "./src/server/security.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Check 14: Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Vite SPA and external embeds compatibility
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Allow Google Auth popups
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: false, // Set on /api routes explicitly below so app embeds cleanly in preview iframes
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.path.startsWith("/api")) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Check 23: Block dotfiles and internal file probes
app.use(blockSensitiveFileRequests);

// Check 12: Rate Limiting
app.use("/api/", apiGeneralLimiter);
app.use("/api/proxy-", proxyLimiter);
app.use("/api/download-file", proxyLimiter);
app.use("/api/og-image", proxyLimiter);
app.use("/api/recommend-movies", aiGenerationLimiter);
app.use("/api/generate-promo-copy", aiGenerationLimiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public", { dotfiles: "deny", index: false }));
app.use(paymentRouter);
app.use(automationRouter);

let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

app.post("/api/recommend-movies", async (req, res) => {
  try {
    const { query, language } = req.body;
    const preferredLang = typeof language === "string" && language.trim() ? language.trim().slice(0, 40) : "English";
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `You are a movie recommendation engine. The user searched for: "${query}". Provide a JSON list of 10 movie titles that exactly match this theme, genre, or keyword. Prioritize movies whose spoken language is ${preferredLang} (or widely available in ${preferredLang} audio). Output ONLY a valid JSON array of strings, e.g. ["Movie 1", "Movie 2"]. Do not include any markdown formatting.`,
      config: {
        responseMimeType: "application/json"
      }
    });
    const resultText = response.text;
    if (resultText) {
       const titles = JSON.parse(resultText);
       res.json({ titles });
    } else {
       res.status(500).json({ error: "No response from Gemini" });
    }
  } catch (error: any) {
    console.error("Gemini recommendation error:", error);
    if (error?.status === 503 || error?.message?.includes("503") || error?.message?.includes("high demand") || error?.status === "UNAVAILABLE") {
      return res.status(503).json({ error: "The AI recommendation service is currently experiencing high demand. Please try again later." });
    }
    res.status(500).json({ error: "Failed to generate recommendations." });
  }
});

app.post("/api/generate-promo-copy", async (req, res) => {
  try {
    const { targetAudience, campaignTheme } = req.body || {};
    if (!ai) {
      return res.json({
        ribbon: "BE ONE OF OUR",
        milestonePrefix: "FIRST",
        milestoneNumber: "1,000",
        badgeSubtext: "FOUNDING READERS!",
        tagline: "YOUR WORLD. YOUR NEWS. YOUR VOICE.",
        breakingHeadline: "Ghana's Economy Shows Positive Growth In Q1 2026",
        topStories: [
          "Parliament Approves New Education Policy",
          "Black Stars Qualify For AFCON 2026",
          "Tech Innovations Changing Africa"
        ],
        scanCta: "SCAN ME!",
        visitCta: "VISIT NOW",
        footerText: "VISIT TODAY: globalnews.site"
      });
    }

    const prompt = `You are a world-class marketing copywriter creating copy for a physical promotional flyer and street poster for "Global News" (a modern Ghanaian & global news platform at globalnews.site).
Target audience: ${targetAudience || "General Readers & Youth in Ghana"}
Campaign theme: ${campaignTheme || "Founding Readers Milestone"}

Output a JSON object with:
- ribbon: short punchy ribbon line (e.g. "BE ONE OF OUR", "CAMPUS VIP ACCESS", "BE THE FIRST TO KNOW")
- milestonePrefix: 1 word uppercase (e.g. "FIRST", "TOP", "JOIN", "NEXT")
- milestoneNumber: milestone quantity with comma (e.g. "1,000", "5,000", "10,000")
- badgeSubtext: uppercase banner text (e.g. "FOUNDING READERS!", "STUDENT LEADERS!", "DAILY SUBSCRIBERS!")
- tagline: brand motto (e.g. "YOUR WORLD. YOUR NEWS. YOUR VOICE.")
- breakingHeadline: a realistic breaking news headline (focused on Ghana or international events)
- topStories: an array of 3 realistic short news headlines
- scanCta: uppercase call to action for the QR code (e.g. "SCAN ME!", "GRAB ACCESS!")
- visitCta: uppercase button text (e.g. "VISIT NOW", "READ FREE")
- footerText: footer domain prompt (e.g. "VISIT TODAY: globalnews.site")

Output ONLY valid JSON without any markdown formatting.`;

    const fetchGemini = async () => {
      const response = await ai!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      return response.text;
    };

    const timeoutPromise = new Promise<string | undefined>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), 5000)
    );

    const text = await Promise.race([fetchGemini(), timeoutPromise]);
    if (text) {
      const data = JSON.parse(text);
      return res.json(data);
    }
    throw new Error("No text returned");
  } catch (error: any) {
    console.warn("Promo copy generation fallback activated:", error?.message || error);
    res.json({

      ribbon: "BE ONE OF OUR",
      milestonePrefix: "FIRST",
      milestoneNumber: "1,000",
      badgeSubtext: "FOUNDING READERS!",
      tagline: "YOUR WORLD. YOUR NEWS. YOUR VOICE.",
      breakingHeadline: "Ghana's Economy Shows Positive Growth In Q1 2026",
      topStories: [
        "Parliament Approves New Education Policy",
        "Black Stars Qualify For AFCON 2026",
        "Tech Innovations Changing Africa"
      ],
      scanCta: "SCAN ME!",
      visitCta: "VISIT NOW",
      footerText: "VISIT TODAY: globalnews.site"
    });
  }
});


const parser = new Parser({
  customFields: {
    item: [
      ['media:thumbnail', 'media'],
      ['media:content', 'mediaContent']
    ]
  },
  requestOptions: { timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/proxy-image", async (req, res) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("URL is required");
    }

    // Bonus B2: SSRF Protection
    const safety = isSafePublicUrl(imageUrl);
    if (!safety.safe) {
      logSecurityEvent("SSRF_BLOCKED_IMAGE_PROXY", { url: imageUrl, ip: req.ip }, "warn");
      return res.status(400).send("Prohibited or invalid target URL.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch image");
    }

    const arrayBuffer = await response.arrayBuffer();
    // Cap image size to 15MB to prevent memory exhaustion
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      return res.status(413).send("Image size exceeds 15MB limit.");
    }
    const buffer = Buffer.from(arrayBuffer);
    
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error: any) {
    console.error("Error proxying image:", error?.message || error);
    res.status(500).send("Error proxying image");
  }
});

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function resolveFfmpegPath(): string {
  // Always prefer native OS ffmpeg first (ffmpeg-static's GnuTLS/glibc binary can SIGSEGV on HTTPS URLs)
  for (const sysPath of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg"]) {
    if (fs.existsSync(sysPath)) {
      return sysPath;
    }
  }
  const staticBin =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : (ffmpegStatic as any)?.default;
  if (typeof staticBin === "string" && fs.existsSync(staticBin)) {
    return staticBin;
  }
  return "ffmpeg";
}

function resolveFfprobePath(): string {
  for (const sysPath of ["/usr/bin/ffprobe", "/usr/local/bin/ffprobe", "/bin/ffprobe"]) {
    if (fs.existsSync(sysPath)) {
      return sysPath;
    }
  }
  return "ffprobe";
}

async function detectEnglishAudioMapArgs(inputSource: string): Promise<string[]> {
  return new Promise((resolve) => {
    const ffprobeBin = resolveFfprobePath();
    const isHttp = /^https?:\/\//i.test(inputSource);
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      ...(isHttp ? ["-user_agent", BROWSER_USER_AGENT] : []),
      inputSource,
    ];

    let stdout = "";
    let settled = false;
    let proc: ReturnType<typeof spawn> | null = null;
    try {
      proc = spawn(ffprobeBin, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve([]);
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          proc?.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve([]);
      }
    }, 4500);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve([]);
      }
    });

    proc.on("close", () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try {
        const parsed = JSON.parse(stdout);
        const streams: any[] = Array.isArray(parsed?.streams) ? parsed.streams : [];
        const audioStreams = streams.filter((s) => s?.codec_type === "audio");
        if (audioStreams.length <= 1) {
          return resolve([]);
        }
        const engStream = audioStreams.find((s) => {
          const lang = String(s?.tags?.language || "").toLowerCase().trim();
          const title = String(s?.tags?.title || "").toLowerCase();
          return (
            lang === "en" ||
            lang === "eng" ||
            lang === "english" ||
            /\benglish\b/.test(title)
          );
        });
        const hasVideo = streams.some((s) => s?.codec_type === "video");
        if (engStream && typeof engStream.index === "number") {
          return resolve(
            hasVideo
              ? ["-map", "0:v:0", "-map", `0:${engStream.index}`]
              : ["-map", `0:${engStream.index}`]
          );
        }
      } catch {
        // ignore probe parse failure
      }
      resolve([]);
    });
  });
}

function getFfmpegQualityArgs(quality: "420p" | "1080p"): string[] {
  if (quality === "420p") {
    // Blurry / Data-Saver 420p (~400 MB for a standard 90-100m film)
    return [
      "-threads", "2",
      "-vf", "scale=-2:420",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "28",
      "-maxrate", "480k",
      "-bufsize", "960k",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "64k",
      "-ac", "2",
    ];
  }
  // Clear HD 1080p (~1 GB for a standard 90-100m film)
  return [
    "-threads", "2",
    "-vf", "scale='min(1920,iw)':-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-maxrate", "1280k",
    "-bufsize", "2560k",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
  ];
}

async function resolveSafeRedirectUrl(rawUrl: string): Promise<{ ok: boolean; finalUrl?: string; reason?: string }> {
  const initialSafety = isSafePublicUrl(rawUrl);
  if (!initialSafety.safe) {
    return { ok: false, reason: initialSafety.reason };
  }

  let currentUrl = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headRes = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": BROWSER_USER_AGENT },
      });
      clearTimeout(timer);

      if (headRes.status >= 300 && headRes.status < 400) {
        const loc = headRes.headers.get("location");
        if (!loc) break;
        const resolved = new URL(loc, currentUrl).toString();
        const hopSafety = isSafePublicUrl(resolved);
        if (!hopSafety.safe) {
          return { ok: false, reason: hopSafety.reason };
        }
        currentUrl = resolved;
        continue;
      }
      return { ok: true, finalUrl: currentUrl };
    } catch {
      clearTimeout(timer);
      return { ok: true, finalUrl: currentUrl };
    }
  }
  return { ok: true, finalUrl: currentUrl };
}

async function transcodeToTempFile(
  inputUrl: string,
  quality: "420p" | "1080p",
  outFilePath: string,
  options?: {
    registerCancel?: (fn: () => void) => void;
    isCancelled?: () => boolean;
    onProgress?: (timeLabel: string, encodedMb: number) => void;
  }
): Promise<void> {
  if (options?.isCancelled?.()) {
    throw new Error("JOB_CANCELLED");
  }
  const englishMapArgs = await detectEnglishAudioMapArgs(inputUrl);
  if (options?.isCancelled?.()) {
    throw new Error("JOB_CANCELLED");
  }

  return new Promise((resolve, reject) => {
    if (options?.isCancelled?.()) {
      return reject(new Error("JOB_CANCELLED"));
    }
    const ffmpegBin = resolveFfmpegPath();
    const isHttpInput = /^https?:\/\//i.test(inputUrl);
    const httpFlags = isHttpInput
      ? [
          "-user_agent", BROWSER_USER_AGENT,
          "-reconnect", "1",
          "-reconnect_streamed", "1",
          "-reconnect_delay_max", "5",
        ]
      : [];

    const args = [
      "-y",
      ...httpFlags,
      "-i", inputUrl,
      ...englishMapArgs,
      ...getFfmpegQualityArgs(quality),
      "-movflags", "+faststart",
      "-f", "mp4",
      outFilePath,
    ];

    const ff = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderrTail = "";
    let settled = false;
    let lastProgressAt = 0;

    ff.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-1500);
      if (options?.onProgress) {
        const now = Date.now();
        if (now - lastProgressAt >= 1500) {
          const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2})/);
          if (timeMatch) {
            lastProgressAt = now;
            let mb = 0;
            try {
              if (fs.existsSync(outFilePath)) {
                mb = Math.round(fs.statSync(outFilePath).size / (1024 * 1024));
              }
            } catch {
              // ignore stat error while writing
            }
            options.onProgress(timeMatch[1], mb);
          }
        }
      }
    });

    const killTimer = setTimeout(() => {
      if (!ff.killed) ff.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("Video encoding timed out."));
      }
    }, 25 * 60 * 1000);

    options?.registerCancel?.(() => {
      clearTimeout(killTimer);
      if (!ff.killed) {
        try {
          ff.kill("SIGKILL");
        } catch {
          // ignore kill error
        }
      }
      if (!settled) {
        settled = true;
        reject(new Error("JOB_CANCELLED"));
      }
    });

    ff.on("error", (err) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        reject(options?.isCancelled?.() ? new Error("JOB_CANCELLED") : err);
      }
    });

    ff.on("close", (code, signal) => {
      clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      if (options?.isCancelled?.()) {
        return reject(new Error("JOB_CANCELLED"));
      }
      if (code === 0 && fs.existsSync(outFilePath) && fs.statSync(outFilePath).size > 0) {
        resolve();
      } else {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        reject(new Error(`Video compression failed (${reason}): ${stderrTail.slice(-240)}`));
      }
    });
  });
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

const DRIVE_FOLDER_NAME = "GlobalNews Movies";

async function driveJsonFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  return res;
}

async function parseGoogleError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    return parsed?.error?.message || text.slice(0, 220) || `Google Drive HTTP ${res.status}`;
  } catch {
    return `Google Drive HTTP ${res.status}`;
  }
}

async function ensureGlobalNewsMoviesFolder(
  accessToken: string,
  createIfMissing: boolean
): Promise<{ folderId: string | null; status: number; errorMessage?: string }> {
  const q = `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchRes = await driveJsonFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    accessToken
  );

  if (!searchRes.ok) {
    const errorMessage = await parseGoogleError(searchRes);
    return { folderId: null, status: searchRes.status, errorMessage };
  }

  const searchData: any = await searchRes.json();
  if (Array.isArray(searchData.files) && searchData.files.length > 0) {
    return { folderId: searchData.files[0].id, status: 200 };
  }

  if (!createIfMissing) {
    return { folderId: null, status: 200 };
  }

  const createRes = await driveJsonFetch("https://www.googleapis.com/drive/v3/files?fields=id,name", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      description: "Movies saved from GlobalNews with data-saver 420p and clear 1080p options.",
    }),
  });

  if (!createRes.ok) {
    const errorMessage = await parseGoogleError(createRes);
    return { folderId: null, status: createRes.status, errorMessage };
  }
  const created: any = await createRes.json();
  return { folderId: created.id, status: 200 };
}

async function uploadLocalFileResumableToDrive(params: {
  accessToken: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  description: string;
  filePath: string;
  overwriteExistingFileId?: string | null;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
  isCancelled?: () => boolean;
  registerCancel?: (fn: () => void) => void;
}) {
  const {
    accessToken,
    folderId,
    fileName,
    mimeType,
    description,
    filePath,
    overwriteExistingFileId,
    onProgress,
    isCancelled,
    registerCancel,
  } = params;
  const totalBytes = fs.statSync(filePath).size;

  if (isCancelled?.()) {
    throw new Error("JOB_CANCELLED");
  }

  const metadata: Record<string, any> = {
    name: fileName,
    description,
  };
  if (!overwriteExistingFileId) {
    metadata.parents = [folderId];
  }

  const initUrl = overwriteExistingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(overwriteExistingFileId)}?uploadType=resumable&fields=id,name,size,mimeType,webViewLink,webContentLink,createdTime,description`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType,webViewLink,webContentLink,createdTime,description`;

  const sessionRes = await driveJsonFetch(initUrl, accessToken, {
    method: overwriteExistingFileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(totalBytes),
    },
    body: JSON.stringify(metadata),
  });

  if (!sessionRes.ok) {
    const msg = await parseGoogleError(sessionRes);
    const err: any = new Error(`Failed to initialize Google Drive upload: ${msg}`);
    err.statusCode = sessionRes.status;
    throw err;
  }

  const uploadUrl = sessionRes.headers.get("location");
  if (!uploadUrl) {
    throw new Error("Google Drive did not return a resumable upload session URL.");
  }

  const uploadAbort = new AbortController();
  registerCancel?.(() => {
    try {
      uploadAbort.abort();
    } catch {
      // ignore abort error
    }
    fetch(uploadUrl, { method: "DELETE" }).catch(() => {});
  });

  // Google Drive resumable chunk size must be a multiple of 256 KB (4 MB = 16 * 256 KB)
  const CHUNK_SIZE = 4 * 1024 * 1024;
  const fd = await fs.promises.open(filePath, "r");
  let offset = 0;

  try {
    while (offset < totalBytes) {
      if (isCancelled?.() || uploadAbort.signal.aborted) {
        await fetch(uploadUrl, { method: "DELETE" }).catch(() => {});
        throw new Error("JOB_CANCELLED");
      }

      const length = Math.min(CHUNK_SIZE, totalBytes - offset);
      const chunkBuf = Buffer.allocUnsafe(length);
      await fd.read(chunkBuf, 0, length, offset);
      const endByte = offset + length - 1;

      let chunkRes: Response;
      try {
        chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          signal: uploadAbort.signal,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(length),
            "Content-Range": `bytes ${offset}-${endByte}/${totalBytes}`,
          },
          body: new Uint8Array(chunkBuf),
        });
      } catch (fetchErr: any) {
        if (isCancelled?.() || uploadAbort.signal.aborted || fetchErr?.name === "AbortError") {
          await fetch(uploadUrl, { method: "DELETE" }).catch(() => {});
          throw new Error("JOB_CANCELLED");
        }
        throw fetchErr;
      }

      if (chunkRes.status === 308) {
        offset += length;
        onProgress?.(offset, totalBytes);
        continue;
      }

      if (chunkRes.ok) {
        onProgress?.(totalBytes, totalBytes);
        return await chunkRes.json();
      }

      const msg = await parseGoogleError(chunkRes);
      const err: any = new Error(`Google Drive upload error (${chunkRes.status}): ${msg}`);
      err.statusCode = chunkRes.status;
      throw err;
    }
  } finally {
    await fd.close();
  }

  throw new Error("Upload completed loop unexpectedly without final response.");
}

async function downloadTorrentMovieToFile(params: {
  torrentSource: Buffer | string;
  workDir: string;
  onProgress?: (downloadedBytes: number, totalBytes: number, speedKbs: number, peers: number) => void;
  registerCancel?: (fn: () => void) => void;
  isCancelled?: () => boolean;
}): Promise<string> {
  const { torrentSource, workDir, onProgress, registerCancel, isCancelled } = params;
  if (isCancelled?.()) {
    throw new Error("JOB_CANCELLED");
  }
  const torrentStreamMod: any = await import("torrent-stream");
  const torrentStream = torrentStreamMod.default || torrentStreamMod;

  fs.mkdirSync(workDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const engine = torrentStream(torrentSource, {
      tmp: workDir,
      path: workDir,
      connections: 60,
      trackers: [
        "udp://open.demonii.com:1337/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.openbittorrent.com:80",
        "udp://tracker.coppersurfer.tk:6969",
        "udp://p4p.arenabg.com:1337",
        "http://tracker.opentrackr.org:1337/announce",
      ],
    });

    let settled = false;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    let activeReadStream: any = null;
    let activeWriteStream: fs.WriteStream | null = null;

    const cleanupTimers = () => {
      if (progressTimer) clearInterval(progressTimer);
      if (stallTimer) clearTimeout(stallTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
    };

    const failWith = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      try {
        activeReadStream?.destroy?.();
      } catch {
        // ignore
      }
      try {
        activeWriteStream?.destroy?.();
      } catch {
        // ignore
      }
      try {
        engine.destroy(() => {});
      } catch {
        // ignore destroy error
      }
      reject(new Error(msg));
    };

    registerCancel?.(() => {
      failWith("JOB_CANCELLED");
    });

    // If metadata + initial bytes do not start within 75s, fail clearly instead of hanging forever
    stallTimer = setTimeout(() => {
      if ((engine.swarm?.downloaded || 0) < 64 * 1024) {
        failWith("No active P2P movie seeds responded within 75 seconds. Please try another quality or title.");
      }
    }, 75000);

    // Absolute 25-minute hard cap per download
    hardTimeout = setTimeout(() => {
      failWith("Movie download exceeded the 25-minute limit.");
    }, 25 * 60 * 1000);

    engine.on("error", (err: any) => {
      failWith(isCancelled?.() ? "JOB_CANCELLED" : (err?.message || "Torrent download failed."));
    });

    engine.on("ready", () => {
      if (isCancelled?.() || settled) {
        return failWith("JOB_CANCELLED");
      }
      const files: any[] = Array.isArray(engine.files) ? engine.files : [];
      if (files.length === 0) {
        return failWith("No files found inside movie source.");
      }

      const videoCandidates = files.filter((f) => /\.(mp4|mkv|avi|mov|m4v|webm)$/i.test(f.name || ""));
      const targetFile = (videoCandidates.length > 0 ? videoCandidates : files).sort(
        (a, b) => (b.length || 0) - (a.length || 0)
      )[0];

      const totalBytes = targetFile.length || 1;
      const ext = path.extname(targetFile.name || ".mp4") || ".mp4";
      const outPath = path.join(workDir, `movie_source${ext}`);

      const readStream = targetFile.createReadStream();
      const writeStream = fs.createWriteStream(outPath);
      activeReadStream = readStream;
      activeWriteStream = writeStream;
      let writtenBytes = 0;

      progressTimer = setInterval(() => {
        if (isCancelled?.() || settled) return;
        const speedKbs = Math.round((engine.swarm?.downloadSpeed?.() || 0) / 1024);
        const peers = engine.swarm?.wires?.length || 0;
        onProgress?.(writtenBytes, totalBytes, speedKbs, peers);
      }, 1200);

      readStream.on("data", (chunk: Buffer) => {
        writtenBytes += chunk.length;
      });

      readStream.on("error", (err: any) => {
        failWith(isCancelled?.() ? "JOB_CANCELLED" : (err?.message || "Failed while streaming movie bytes."));
      });

      writeStream.on("error", (err: any) => {
        failWith(isCancelled?.() ? "JOB_CANCELLED" : (err?.message || "Failed writing temporary movie file."));
      });

      writeStream.on("finish", () => {
        if (settled) return;
        if (isCancelled?.()) {
          return failWith("JOB_CANCELLED");
        }
        settled = true;
        cleanupTimers();
        onProgress?.(totalBytes, totalBytes, 0, 0);
        engine.destroy(() => resolve(outPath));
      });

      readStream.pipe(writeStream);
    });
  });
}

interface DriveSaveJob {
  jobId: string;
  jobKey: string;
  title: string;
  quality: "420p" | "1080p";
  status: "queued" | "downloading" | "transcoding" | "uploading" | "completed" | "failed" | "cancelled";
  progressPercent: number;
  message: string;
  targetFileName: string;
  folderId: string;
  folderUrl: string;
  cancelled?: boolean;
  cancelHandle?: () => void;
  file?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const driveSaveJobs = new Map<string, DriveSaveJob>();
const DRIVE_JOBS_FILE = path.join(process.cwd(), "data", "drive_jobs.json");

function safeTimingEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isAuthorizedForDriveJob(req: express.Request, job: DriveSaveJob, providedJobKey?: string): boolean {
  if (extractBearerToken(req)) return true;
  const headerKey = typeof req.headers["x-job-key"] === "string" ? req.headers["x-job-key"].trim() : "";
  const key = (providedJobKey || headerKey || "").trim();
  return Boolean(key && job.jobKey && safeTimingEqual(key, job.jobKey));
}

let persistJobsTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistDriveJobs(immediate = false) {
  const writeNow = () => {
    try {
      const dir = path.dirname(DRIVE_JOBS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const items = Array.from(driveSaveJobs.values()).map((j) => {
        const { cancelHandle: _omitHandle, ...persistable } = j;
        return persistable;
      });
      fs.writeFileSync(DRIVE_JOBS_FILE, JSON.stringify(items, null, 2), "utf8");
    } catch (e: any) {
      console.warn("[DriveJobs] Failed persisting jobs:", e?.message || e);
    }
  };

  if (immediate) {
    if (persistJobsTimer) {
      clearTimeout(persistJobsTimer);
      persistJobsTimer = null;
    }
    writeNow();
    return;
  }

  if (persistJobsTimer) return;
  persistJobsTimer = setTimeout(() => {
    persistJobsTimer = null;
    writeNow();
  }, 800);
}

// Load persisted jobs from previous session at startup
try {
  if (fs.existsSync(DRIVE_JOBS_FILE)) {
    const raw = fs.readFileSync(DRIVE_JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cutoff = Date.now() - 6 * 60 * 60 * 1000;
      for (const item of parsed) {
        if (!item?.jobId || (item.createdAt || 0) < cutoff) continue;
        const wasActive = ["queued", "downloading", "transcoding", "uploading"].includes(item.status);
        driveSaveJobs.set(item.jobId, {
          ...item,
          status: wasActive ? "failed" : item.status,
          error: wasActive ? "Server restarted while downloading. Please start this download again." : item.error,
          message: wasActive ? "Server restarted while downloading. Please tap Retry or start again." : item.message,
        });
      }
    }
  }
} catch {
  // ignore corrupted file
}

function serializeDriveJob(job: DriveSaveJob) {
  const { cancelHandle: _omitHandle, cancelled: _omitCancelled, jobKey: _omitKey, ...safeJob } = job;
  return safeJob;
}

// Prune completed/failed/cancelled jobs older than 6 hours
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  let removed = false;
  for (const [id, job] of driveSaveJobs.entries()) {
    if (job.createdAt < cutoff) {
      driveSaveJobs.delete(id);
      removed = true;
    }
  }
  if (removed) schedulePersistDriveJobs();
}, 10 * 60 * 1000).unref?.();

async function runDriveSaveJob(params: {
  jobId: string;
  accessToken: string;
  folderId: string;
  targetFileName: string;
  quality: "420p" | "1080p";
  videoUrl: string | null;
  torrentUrl: string | null;
  magnetUrl: string | null;
  overwriteExistingFileId: string | null;
}) {
  const { jobId, accessToken, folderId, targetFileName, quality, videoUrl, torrentUrl, magnetUrl, overwriteExistingFileId } = params;
  const workDir = path.join(os.tmpdir(), `gn_job_${jobId}`);
  const tempEncodedPath = path.join(workDir, "encoded_output.mp4");
  const tierLabel = quality === "420p" ? "Blurry 420p (~400 MB)" : "Clear 1080p (~1 GB)";

  const isCancelled = () => Boolean(driveSaveJobs.get(jobId)?.cancelled);
  const setCancelHandle = (fn: () => void) => {
    const existing = driveSaveJobs.get(jobId);
    if (existing) {
      existing.cancelHandle = fn;
    }
  };
  const updateJob = (patch: Partial<DriveSaveJob>, immediatePersist = false) => {
    const existing = driveSaveJobs.get(jobId);
    if (existing && !existing.cancelled) {
      driveSaveJobs.set(jobId, { ...existing, ...patch, updatedAt: Date.now() });
      schedulePersistDriveJobs(immediatePersist);
    }
  };

  try {
    if (isCancelled()) throw new Error("JOB_CANCELLED");
    fs.mkdirSync(workDir, { recursive: true });
    let ffmpegInputSource: string | null = null;

    if (videoUrl) {
      const urlCheck = await resolveSafeRedirectUrl(videoUrl);
      if (isCancelled()) throw new Error("JOB_CANCELLED");
      if (!urlCheck.ok || !urlCheck.finalUrl) {
        throw new Error("Invalid or prohibited video source URL.");
      }
      ffmpegInputSource = urlCheck.finalUrl;
      updateJob({
        status: "transcoding",
        progressPercent: 18,
        message: `Compressing movie to ${tierLabel}...`,
      });
    } else {
      updateJob({
        status: "downloading",
        progressPercent: 4,
        message: "Connecting to movie seeds on server (0 Phone Data used)...",
      });

      let torrentSource: Buffer | string | null = null;
      if (torrentUrl) {
        const urlCheck = await resolveSafeRedirectUrl(torrentUrl);
        if (isCancelled()) throw new Error("JOB_CANCELLED");
        if (urlCheck.ok && urlCheck.finalUrl) {
          try {
            const tRes = await fetch(urlCheck.finalUrl, {
              signal: AbortSignal.timeout(12000),
              headers: { "User-Agent": BROWSER_USER_AGENT },
            });
            if (tRes.ok) {
              const buf = Buffer.from(await tRes.arrayBuffer());
              if (buf.byteLength > 0 && buf.byteLength < 10 * 1024 * 1024) {
                torrentSource = buf;
              }
            }
          } catch {
            // fallback to magnet
          }
        }
      }

      if (isCancelled()) throw new Error("JOB_CANCELLED");

      if (!torrentSource && magnetUrl) {
        torrentSource = magnetUrl;
      }
      if (!torrentSource) {
        throw new Error("No valid video, torrent, or magnet source found.");
      }

      ffmpegInputSource = await downloadTorrentMovieToFile({
        torrentSource,
        workDir,
        registerCancel: setCancelHandle,
        isCancelled,
        onProgress: (dl, total, speedKbs, peers) => {
          const pct = Math.min(55, Math.max(5, Math.round((dl / Math.max(1, total)) * 50) + 5));
          const dlMb = Math.round(dl / (1024 * 1024));
          const totMb = Math.round(total / (1024 * 1024));
          updateJob({
            status: "downloading",
            progressPercent: pct,
            message: `Downloading movie on server: ${dlMb} MB / ${totMb} MB (${speedKbs} KB/s • ${peers} peers)`,
          });
        },
      });

      if (isCancelled()) throw new Error("JOB_CANCELLED");

      updateJob({
        status: "transcoding",
        progressPercent: 58,
        message: `Compressing video to ${tierLabel}...`,
      });
    }

    if (isCancelled()) throw new Error("JOB_CANCELLED");

    const transcodeStartPct = videoUrl ? 18 : 58;
    let encodeTick = 0;
    await transcodeToTempFile(ffmpegInputSource, quality, tempEncodedPath, {
      registerCancel: setCancelHandle,
      isCancelled,
      onProgress: (timeLabel, encodedMb) => {
        encodeTick++;
        const nextPct = Math.min(70, transcodeStartPct + Math.min(12, Math.floor(encodeTick / 2)));
        updateJob({
          status: "transcoding",
          progressPercent: nextPct,
          message: `Compressing ${tierLabel}: ${timeLabel} encoded (${encodedMb} MB ready)...`,
        });
      },
    });

    if (isCancelled()) throw new Error("JOB_CANCELLED");

    const encodedMb = Math.round(fs.statSync(tempEncodedPath).size / (1024 * 1024));
    updateJob({
      status: "uploading",
      progressPercent: 72,
      message: `Uploading ${encodedMb} MB MP4 directly to your Google Drive...`,
    });

    const savedFile = await uploadLocalFileResumableToDrive({
      accessToken,
      folderId,
      fileName: targetFileName,
      mimeType: "video/mp4",
      description: `GlobalNews Movie (${tierLabel})`,
      filePath: tempEncodedPath,
      overwriteExistingFileId,
      isCancelled,
      registerCancel: setCancelHandle,
      onProgress: (uploaded, total) => {
        const pct = Math.min(99, 72 + Math.round((uploaded / Math.max(1, total)) * 27));
        const upMb = Math.round(uploaded / (1024 * 1024));
        const totMb = Math.round(total / (1024 * 1024));
        updateJob({
          status: "uploading",
          progressPercent: pct,
          message: `Uploading to Google Drive: ${upMb} MB / ${totMb} MB...`,
        });
      },
    });

    if (isCancelled()) throw new Error("JOB_CANCELLED");

    updateJob({
      status: "completed",
      progressPercent: 100,
      message: `Saved "${savedFile.name}" (${encodedMb} MB) to Google Drive!`,
      file: savedFile,
    }, true);
  } catch (err: any) {
    if (isCancelled() || err?.message === "JOB_CANCELLED") {
      const existing = driveSaveJobs.get(jobId);
      if (existing) {
        driveSaveJobs.set(jobId, {
          ...existing,
          cancelled: true,
          status: "cancelled",
          message: "Download cancelled by user.",
          updatedAt: Date.now(),
        });
        schedulePersistDriveJobs(true);
      }
    } else {
      console.error(`[DriveJob ${jobId}] Failed:`, err?.message || err);
      updateJob({
        status: "failed",
        message: err?.message || "Failed saving movie to Google Drive.",
        error: err?.message || "Failed saving movie to Google Drive.",
      }, true);
    }
  } finally {
    const existing = driveSaveJobs.get(jobId);
    if (existing) existing.cancelHandle = undefined;
    fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

app.get("/api/drive/files", async (req, res) => {
  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      return res.status(401).json({ error: "Google Drive authorization required. Please sign in with Google." });
    }

    const { folderId, status, errorMessage } = await ensureGlobalNewsMoviesFolder(accessToken, false);
    if (status === 401) {
      return res.status(401).json({ error: "Google Drive session expired. Please reconnect Google." });
    }
    if (status >= 400) {
      return res.status(status).json({ error: errorMessage || "Unable to access Google Drive." });
    }
    if (!folderId) {
      return res.json({ files: [], folderId: null, folderUrl: null });
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const q = `'${folderId}' in parents and trashed = false`;
    const listRes = await driveJsonFetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=50&fields=files(id,name,size,mimeType,webViewLink,webContentLink,createdTime,description)`,
      accessToken
    );

    if (listRes.status === 401) {
      return res.status(401).json({ error: "Google Drive session expired. Please reconnect Google." });
    }
    if (!listRes.ok) {
      const msg = await parseGoogleError(listRes);
      return res.status(listRes.status).json({ error: msg });
    }

    const data: any = await listRes.json();
    return res.json({ folderId, folderUrl, files: Array.isArray(data.files) ? data.files : [] });
  } catch (error: any) {
    console.error("Error listing Google Drive files:", error?.message || error);
    return res.status(500).json({ error: "Failed to read Google Drive folder." });
  }
});

app.post("/api/drive/jobs/batch-status", (req, res) => {
  const list = Array.isArray(req.body?.jobs) ? req.body.jobs.slice(0, 25) : [];
  const hasBearer = Boolean(extractBearerToken(req));
  const resolvedJobs: any[] = [];
  const missingIds: string[] = [];

  for (const item of list) {
    const jobId = typeof item?.jobId === "string" ? item.jobId.trim() : "";
    const jobKey = typeof item?.jobKey === "string" ? item.jobKey.trim() : "";
    if (!jobId) continue;

    const job = driveSaveJobs.get(jobId);
    if (!job) {
      missingIds.push(jobId);
      continue;
    }

    if (hasBearer || (jobKey && job.jobKey && safeTimingEqual(jobKey, job.jobKey))) {
      resolvedJobs.push(serializeDriveJob(job));
    }
  }

  return res.json({ jobs: resolvedJobs, missingIds });
});

app.get("/api/drive/jobs/:jobId", (req, res) => {
  const job = driveSaveJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Save job not found or expired." });
  }
  if (!isAuthorizedForDriveJob(req, job)) {
    return res.status(401).json({ error: "Google Drive authorization required." });
  }
  return res.json(serializeDriveJob(job));
});

app.post("/api/drive/jobs/:jobId/cancel", (req, res) => {
  const jobId = req.params.jobId;
  const job = driveSaveJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Save job not found or expired." });
  }
  if (!isAuthorizedForDriveJob(req, job)) {
    return res.status(401).json({ error: "Google Drive authorization required." });
  }
  if (job.status === "completed") {
    return res.status(409).json({ error: "Movie download already finished in Google Drive." });
  }

  job.cancelled = true;
  job.status = "cancelled";
  job.message = "Download cancelled by user.";
  job.updatedAt = Date.now();
  const handle = job.cancelHandle;
  job.cancelHandle = undefined;
  schedulePersistDriveJobs(true);
  try {
    handle?.();
  } catch {
    // ignore cancel handle error
  }
  const workDir = path.join(os.tmpdir(), `gn_job_${jobId}`);
  fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});

  return res.json({
    status: "cancelled",
    jobId: job.jobId,
    message: job.message,
  });
});

app.post("/api/drive/save-movie", async (req, res) => {
  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      return res.status(401).json({ error: "Google Drive authorization required. Please sign in with Google." });
    }

    const title = sanitizeString(req.body?.title, 120);
    const year = sanitizeString(req.body?.year, 16);
    const quality: "420p" | "1080p" = req.body?.quality === "1080p" ? "1080p" : "420p";
    const videoUrl = typeof req.body?.videoUrl === "string" && req.body.videoUrl.trim() ? req.body.videoUrl.trim() : null;
    const torrentUrl = typeof req.body?.torrentUrl === "string" && req.body.torrentUrl.trim() ? req.body.torrentUrl.trim() : null;
    const magnetUrl = typeof req.body?.magnetUrl === "string" && req.body.magnetUrl.trim() ? req.body.magnetUrl.trim() : null;
    const overwriteExistingFileId =
      typeof req.body?.overwriteExistingFileId === "string" && req.body.overwriteExistingFileId.trim()
        ? req.body.overwriteExistingFileId.trim()
        : null;

    if (!title) {
      return res.status(400).json({ error: "Movie title is required." });
    }
    if (!videoUrl && !torrentUrl && !magnetUrl) {
      return res.status(400).json({ error: "No downloadable video or torrent source available for this movie." });
    }

    // Validate SSRF on videoUrl / torrentUrl up front
    if (videoUrl) {
      const safety = isSafePublicUrl(videoUrl);
      if (!safety.safe) {
        logSecurityEvent("SSRF_BLOCKED_DRIVE_SAVE", { url: videoUrl, ip: req.ip }, "warn");
        return res.status(400).json({ error: "Invalid or prohibited video URL." });
      }
    }
    if (torrentUrl) {
      const safety = isSafePublicUrl(torrentUrl);
      if (!safety.safe) {
        logSecurityEvent("SSRF_BLOCKED_DRIVE_TORRENT", { url: torrentUrl, ip: req.ip }, "warn");
        return res.status(400).json({ error: "Invalid or prohibited torrent URL." });
      }
    }

    const { folderId, status, errorMessage } = await ensureGlobalNewsMoviesFolder(accessToken, true);
    if (status === 401) {
      return res.status(401).json({ error: "Google Drive session expired. Please reconnect your Google account." });
    }
    if (!folderId) {
      return res.status(status >= 400 ? status : 502).json({
        error:
          errorMessage ||
          "Could not access GlobalNews Movies folder. Make sure you granted Google Drive permission when signing in with Google.",
      });
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const cleanBaseTitle = `${title}${year && year !== "N/A" ? ` (${year})` : ""}`
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const tierSuffix = quality === "420p" ? "420p DataSaver (~400MB)" : "1080p Clear HD (~1GB)";
    const targetFileName = `${cleanBaseTitle} - ${tierSuffix}.mp4`;

    // Check for duplicate file in Drive before starting background download/upload
    if (!overwriteExistingFileId) {
      const escapedFileName = targetFileName.replace(/'/g, "\\'");
      const dupQuery = `name = '${escapedFileName}' and '${folderId}' in parents and trashed = false`;
      const dupRes = await driveJsonFetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(dupQuery)}&fields=files(id,name,size,mimeType,webViewLink,createdTime)`,
        accessToken
      );

      if (dupRes.status === 401) {
        return res.status(401).json({ error: "Google Drive session expired. Please reconnect Google." });
      }
      if (dupRes.ok) {
        const dupData: any = await dupRes.json();
        if (Array.isArray(dupData.files) && dupData.files.length > 0) {
          return res.json({
            status: "duplicate",
            existingFile: dupData.files[0],
            targetFileName,
            folderId,
            folderUrl,
          });
        }
      }
    }

    const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const jobKey = crypto.randomBytes(24).toString("hex");
    const now = Date.now();
    driveSaveJobs.set(jobId, {
      jobId,
      jobKey,
      title,
      quality,
      status: "queued",
      progressPercent: 2,
      message: "Preparing movie transfer to Google Drive...",
      targetFileName,
      folderId,
      folderUrl,
      createdAt: now,
      updatedAt: now,
    });
    schedulePersistDriveJobs(true);

    void runDriveSaveJob({
      jobId,
      accessToken,
      folderId,
      targetFileName,
      quality,
      videoUrl,
      torrentUrl,
      magnetUrl,
      overwriteExistingFileId,
    });

    return res.json({
      status: "started",
      jobId,
      jobKey,
      title,
      quality,
      targetFileName,
      folderId,
      folderUrl,
    });
  } catch (error: any) {
    const code = error?.statusCode === 401 ? 401 : 500;
    console.error("Error initiating Google Drive save:", error?.message || error);
    return res.status(code).json({
      error: code === 401
        ? "Google Drive session expired. Please reconnect your Google account."
        : (error?.message || "Failed to start movie save to Google Drive."),
    });
  }
});

app.get("/api/download-file", async (req, res) => {
  try {
    const fileUrl = req.query.url as string;
    const rawFilename = (req.query.filename as string) || "movie.mp4";
    const qualityParam = typeof req.query.quality === "string" ? req.query.quality.trim().toLowerCase() : "original";
    const quality: "420p" | "1080p" | "original" =
      qualityParam === "420p" ? "420p" : qualityParam === "1080p" ? "1080p" : "original";
    const filename = rawFilename.replace(/[/\\?%*:|"<>]/g, "_").trim();

    if (!fileUrl) {
      return res.status(400).send("URL parameter is required");
    }

    // Bonus B2: SSRF Protection
    const safety = isSafePublicUrl(fileUrl);
    if (!safety.safe) {
      logSecurityEvent("SSRF_BLOCKED_DOWNLOAD", { url: fileUrl, ip: req.ip }, "warn");
      return res.status(400).send("Prohibited or invalid target URL.");
    }

    const isTorrent = filename.toLowerCase().endsWith(".torrent") || fileUrl.toLowerCase().includes(".torrent");

    // Transcode video stream on-the-fly for Blurry 420p (~400MB) or Clear 1080p (~1GB)
    if (!isTorrent && (quality === "420p" || quality === "1080p")) {
      const urlCheck = await resolveSafeRedirectUrl(fileUrl);
      if (!urlCheck.ok || !urlCheck.finalUrl) {
        logSecurityEvent("SSRF_BLOCKED_DOWNLOAD_REDIRECT", { url: fileUrl, ip: req.ip }, "warn");
        return res.status(400).send("Prohibited or invalid target URL.");
      }

      const baseName = filename.replace(/\.mp4$/i, "");
      const outFilename = `${baseName}_${quality}.mp4`;

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(outFilename)}"; filename*=UTF-8''${encodeURIComponent(outFilename)}`
      );
      res.setHeader("Content-Type", "video/mp4");

      const ffmpegBin = resolveFfmpegPath();
      const englishMapArgs = await detectEnglishAudioMapArgs(urlCheck.finalUrl);
      const args = [
        "-user_agent", BROWSER_USER_AGENT,
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", urlCheck.finalUrl,
        ...englishMapArgs,
        ...getFfmpegQualityArgs(quality),
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4",
        "pipe:1",
      ];

      const ff = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
      ff.stdout.pipe(res);

      let stderrLog = "";
      ff.stderr.on("data", (d: Buffer) => {
        stderrLog = (stderrLog + d.toString()).slice(-500);
      });

      req.on("close", () => {
        if (!ff.killed) ff.kill("SIGKILL");
      });

      ff.on("close", (code) => {
        if (code !== 0 && !res.writableEnded) {
          console.warn(`FFmpeg stream ended with code ${code}: ${stderrLog}`);
          res.end();
        }
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(fileUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_USER_AGENT
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // If server-side fetch is blocked by upstream bot protection, redirect client directly
      return res.redirect(302, fileUrl);
    }

    const contentType = response.headers.get('content-type') || (isTorrent ? 'application/x-bittorrent' : 'video/mp4');
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch (streamErr) {
          console.error("Streaming interrupted:", streamErr);
          if (!res.writableEnded) res.end();
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (error: any) {
    console.error("Error downloading file:", error?.message || error);
    if (!res.headersSent) {
      res.status(500).send("Error downloading file");
    }
  }
});

const CATEGORY_FEEDS: Record<string, { url: string; source: string }[]> = {
  "Top Stories": [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  ],
  "Ghana": [
    { url: 'https://www.myjoyonline.com/feed/', source: 'MyJoyOnline' },
    { url: 'https://www.graphic.com.gh/news/general-news.feed?type=rss', source: 'Daily Graphic' },
    { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', source: 'BBC Africa' }
  ],
  "World": [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NY Times' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  ],
  "Politics": [
    { url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', source: 'BBC Politics' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', source: 'NY Times Politics' },
  ],
  "Business": [
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
    { url: 'https://finance.yahoo.com/news/rss', source: 'Yahoo Finance' },
  ],
  "Technology": [
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', source: 'NY Times Tech' },
  ],
  "Sports": [
    { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC Sports' },
    { url: 'https://sports.yahoo.com/rss/', source: 'Yahoo Sports' },
  ],
  "Entertainment": [
    { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC Ent & Arts' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml', source: 'NY Times Arts' },
  ],
  "Health": [
    { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', source: 'BBC Health' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', source: 'NY Times Health' },
  ]
};


app.get("/api/proxy-apibay", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).send("Query is required");
    }
    const response = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error proxying apibay:", error);
    res.status(500).send("Error proxying apibay");
  }
});


app.get("/api/proxy-yts", async (req, res) => {
  try {
    const imdbId = req.query.imdb_id;
    if (!imdbId) {
      return res.status(400).send("imdb_id is required");
    }
    const response = await fetch(`https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=${imdbId}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error proxying yts:", error);
    res.status(500).send("Error proxying yts");
  }
});

app.get("/api/movies/recent", async (req, res) => {
  try {
    const sortBy = req.query.sort === "latest" ? "date_added" : "download_count";
    const langParam = typeof req.query.lang === "string" ? req.query.lang.trim().toLowerCase() : "en";
    const englishOnly = langParam !== "all";
    const fetchLimit = englishOnly ? 50 : 24;
    const response = await fetch(
      `https://movies-api.accel.li/api/v2/list_movies.json?limit=${fetchLimit}&sort_by=${sortBy}&order_by=desc&minimum_rating=5${englishOnly ? "&language=en" : ""}`
    );
    const data: any = await response.json();
    if (englishOnly && Array.isArray(data?.data?.movies)) {
      const englishMovies = data.data.movies.filter(
        (m: any) => String(m?.language || "").toLowerCase() === "en"
      );
      data.data.movies = (englishMovies.length > 0 ? englishMovies : data.data.movies).slice(0, 24);
    }
    res.json(data);
  } catch (error) {
    console.error("Error proxying movies api:", error);
    res.status(500).send("Error proxying movies api");
  }
});

async function isEmbeddableYouTubeId(videoId: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

app.get("/api/movies/trailer", async (req, res) => {
  try {
    const title = typeof req.query.title === "string" ? req.query.title.trim().slice(0, 140) : "";
    const year = typeof req.query.year === "string" ? req.query.year.trim().slice(0, 12) : "";
    const imdbId = typeof req.query.imdbId === "string" ? req.query.imdbId.trim().slice(0, 24) : "";
    const type = req.query.type === "series" ? "shows" : "movies";
    const ytCode = typeof req.query.ytCode === "string" ? req.query.ytCode.trim() : "";

    const searchQueryText = `${title} ${year && year !== "N/A" ? year : ""} official movie trailer English`.trim();
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQueryText || "official movie trailer English")}`;

    const tryVideoId = async (candidate?: string | null) => {
      if (!candidate || !/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return null;
      const valid = await isEmbeddableYouTubeId(candidate);
      return valid ? candidate : null;
    };

    // 1. Try caller-supplied YouTube trailer code (e.g. from YTS)
    let resolvedId = await tryVideoId(ytCode);

    // 2. Try KinoCheck by IMDb ID
    if (!resolvedId && /^tt\d+$/i.test(imdbId)) {
      try {
        const kcRes = await fetch(`https://api.kinocheck.de/${type}?imdb_id=${encodeURIComponent(imdbId)}&language=en`, {
          signal: AbortSignal.timeout(4000)
        });
        if (kcRes.ok) {
          const kcData: any = await kcRes.json();
          resolvedId = await tryVideoId(kcData?.trailer?.youtube_video_id);
        }
      } catch {
        // continue to next source
      }
    }

    // 3. Try YTS movie_details by IMDb ID
    if (!resolvedId && type === "movies" && /^tt\d+$/i.test(imdbId)) {
      try {
        const ytsRes = await fetch(`https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=${encodeURIComponent(imdbId)}`, {
          signal: AbortSignal.timeout(4000)
        });
        if (ytsRes.ok) {
          const ytsData: any = await ytsRes.json();
          resolvedId = await tryVideoId(ytsData?.data?.movie?.yt_trailer_code);
        }
      } catch {
        // continue to YouTube search
      }
    }

    // 4. Resolve real YouTube video ID from YouTube search HTML
    if (!resolvedId && title) {
      try {
        const ytRes = await fetch(searchUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
          }
        });
        if (ytRes.ok) {
          const html = await ytRes.text();
          const matches = Array.from(html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)).map((m) => m[1]);
          const uniqueIds = Array.from(new Set(matches)).slice(0, 4);
          for (const candidateId of uniqueIds) {
            resolvedId = await tryVideoId(candidateId);
            if (resolvedId) break;
          }
        }
      } catch {
        // fallback below
      }
    }

    if (resolvedId) {
      return res.json({
        videoId: resolvedId,
        embedUrl: `https://www.youtube.com/embed/${resolvedId}?autoplay=1&rel=0&modestbranding=1&hl=en&cc_lang_pref=en`,
        watchUrl: `https://www.youtube.com/watch?v=${resolvedId}`,
        searchUrl
      });
    }

    return res.json({
      videoId: null,
      embedUrl: null,
      watchUrl: searchUrl,
      searchUrl
    });
  } catch (error) {
    console.error("Trailer lookup error:", error);
    res.status(500).json({ error: "Failed to resolve trailer" });
  }
});


app.get("/api/search-news", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().toLowerCase();
    if (!q) return res.json([]);
    
    // search across a few top feeds
    const feedsToFetch = [
      ...CATEGORY_FEEDS["Top Stories"],
      ...CATEGORY_FEEDS["World"],
      ...CATEGORY_FEEDS["Technology"],
      ...CATEGORY_FEEDS["Business"]
    ];
    // unique feeds
    const uniqueFeeds = Array.from(new Set(feedsToFetch.map(f => f.url))).map(url => feedsToFetch.find(f => f.url === url));
    
    let allItems: any[] = [];
    
    for (const feedConfig of uniqueFeeds) {
      if (!feedConfig) continue;
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 8000));
        const feed = await Promise.race([parser.parseURL(feedConfig.url), timeoutPromise]) as any;
        const items = feed.items.map((item) => {
          let imageUrl;
          if (item.media && item.media.$ && item.media.$.url) {
            imageUrl = item.media.$.url.replace('/standard/240/', '/standard/800/');
          } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            imageUrl = item.mediaContent.$.url;
          }
          return {
            source: feedConfig.source,
            time: item.pubDate ? new Date(item.pubDate).toLocaleString() : "RECENT",
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            title: item.title,
            summary: item.contentSnippet || item.content || "",
            likes: Math.floor(Math.random() * 500) + 10,
            comments: Math.floor(Math.random() * 100),
            image: imageUrl,
            link: item.link
          };
        });
        allItems = [...allItems, ...items];
      } catch (e) {}
    }
    
    // Filter
    const results = allItems.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) || 
      (item.summary && item.summary.toLowerCase().includes(q)) ||
      (item.source && item.source.toLowerCase().includes(q))
    );
    
    res.json(results.sort((a,b) => b.timestamp - a.timestamp).slice(0, 50));
  } catch (error) {
    console.error("Error searching news:", error);
    res.status(500).send("Error searching news");
  }
});


// Endpoint to fetch og:image for articles that don't provide an image in their RSS feed
app.get('/api/og-image', async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('Missing url');
    }

    // Bonus B2: SSRF Protection
    const safety = isSafePublicUrl(targetUrl);
    if (!safety.safe) {
      logSecurityEvent("SSRF_BLOCKED_OG_IMAGE", { url: targetUrl, ip: req.ip }, "warn");
      return res.status(400).send("Prohibited or invalid target URL.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    
    const response = await fetch(targetUrl, {
       signal: controller.signal,
       headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    clearTimeout(timeout);
    const html = await response.text();
    
    let ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    }
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    }
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    }
    
    if (ogMatch && ogMatch[1]) {
       let imgUrl = ogMatch[1];
       if (imgUrl.startsWith('/')) {
         const urlObj = new URL(targetUrl);
         imgUrl = urlObj.origin + imgUrl;
       }
       return res.redirect(imgUrl);
    }
    
    return res.status(404).send('No image found');
  } catch (error) {
    res.status(500).send('Error fetching og:image');
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const category = (req.query.category) || "Top Stories";
    const feedsToFetch = CATEGORY_FEEDS[category] || CATEGORY_FEEDS["Top Stories"];
    
    const feedPromises = feedsToFetch.map(async (feedConfig) => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 5000));
        const feed = await Promise.race([parser.parseURL(feedConfig.url), timeoutPromise]);
        
        return feed.items.slice(0, 20).map((item) => {
          let imageUrl = null;
          if (item.media && item.media.$ && item.media.$.url) {
            imageUrl = item.media.$.url;
          } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            imageUrl = item.mediaContent.$.url;
          } else if (item.enclosure && item.enclosure.url && typeof item.enclosure.type === 'string' && item.enclosure.type.startsWith('image')) {
            imageUrl = item.enclosure.url;
          } else {
            const content = item['content:encoded'] || item.content || '';
            const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch) {
              imageUrl = imgMatch[1];
            }
          }
          if (imageUrl) {
            imageUrl = imageUrl.replace('/standard/240/', '/standard/800/');
          }
          return {
            source: feedConfig.source,
            time: item.pubDate ? new Date(item.pubDate).toLocaleString() : "RECENT",
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            title: item.title,
            summary: item.contentSnippet || item.content || "",
            likes: Math.floor(Math.random() * 500) + 10,
            comments: Math.floor(Math.random() * 100),
            image: imageUrl || null,
            link: item.link
          };
        });
      } catch (feedError) {
        console.error(`Error fetching feed ${feedConfig.url}:`, feedError.message);
        return [];
      }
    });

    const results = await Promise.all(feedPromises);
    const allItems = results.flat();

    // Sort by newest
    allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Deduplicate by URL or title
    const seen = new Set();
    const uniqueItems = [];
    for (const item of allItems) {
      const identifier = item.link || item.title;
      if (!seen.has(identifier)) {
        seen.add(identifier);
        uniqueItems.push(item);
      }
    }

    // Assign id and isTopStory
    const finalItems = uniqueItems.map((item, index) => ({
      ...item,
      id: index + 1,
      isTopStory: category === "Top Stories" ? index < 5 : index < 3
    }));

    res.json(finalItems);
  } catch (error) {
    console.error("RSS API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const isProd = process.env.NODE_ENV === "production";
let viteServerPromise: Promise<any> | null = null;

if (!isProd) {
  viteServerPromise = import("vite")
    .then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      })
    )
    .catch((err) => {
      console.error("Failed to initialize Vite dev middleware:", err);
      throw err;
    });

  app.use(async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    try {
      const vite = await viteServerPromise!;
      vite.middlewares(req, res, next);
    } catch (err) {
      next(err);
    }
  });
} else {
  const distDir = path.resolve(process.cwd(), "dist");
  app.use(express.static(distDir, { dotfiles: "deny", index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// Check 20: Production Error Handler (Suppress stack traces & internal error details)
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logSecurityEvent("UNHANDLED_EXCEPTION", {
    path: req.path,
    ip: req.ip,
    message: err?.message,
  }, "error");

  if (!res.headersSent) {
    res.status(500).json({
      error: "An unexpected error occurred. Please try again later.",
      code: "INTERNAL_ERROR"
    });
  }
});

function resolveListenPort(): number {
  const portFlagIdx = process.argv.findIndex(
    (arg) => arg === "--port" || arg.startsWith("--port=")
  );
  if (portFlagIdx !== -1) {
    const raw = process.argv[portFlagIdx];
    const value = raw.includes("=") ? raw.split("=")[1] : process.argv[portFlagIdx + 1];
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  const envPort = Number(process.env.PORT);
  if (!isProd) {
    // In container dev environments PORT=8080 is reserved by the reverse proxy -> 3000
    return Number.isInteger(envPort) && envPort > 0 && envPort !== 8080 ? envPort : 3000;
  }
  return Number.isInteger(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolveListenPort();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on http://0.0.0.0:${PORT}...`);
});
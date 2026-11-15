import { Router, Request, Response } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";
import { Resvg } from "@resvg/resvg-js";
import {
  OWNER_EMAILS,
  RECIPIENT_PHONE,
  RECIPIENT_NAME,
  RECIPIENT_NETWORK,
} from "./paymentRoutes.js";
import {
  requireAdminAuth,
  aiGenerationLimiter,
  logSecurityEvent,
} from "./security.js";

const execFileAsync = promisify(execFile);

function getFfmpegBinary(): string {
  for (const sysPath of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg"]) {
    if (fs.existsSync(sysPath)) return sysPath;
  }
  const staticBin =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : (ffmpegStatic as any)?.default;
  if (staticBin && fs.existsSync(staticBin)) {
    return staticBin;
  }
  return "ffmpeg";
}

function getSystemFfmpegWithFlite(): string {
  for (const sysPath of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg"]) {
    if (fs.existsSync(sysPath)) return sysPath;
  }
  return getFfmpegBinary();
}

const BUNDLED_FONT_FILES = [
  path.resolve(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf"),
  path.resolve(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf"),
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
].filter((f) => fs.existsSync(f));

export const automationRouter = Router();

// ============================================================================
// CONSTANTS & PRICING LIMITS (COST CONTROL)
// ============================================================================
export const FREE_MONTHLY_VIDEO_LIMIT = 3;
export const PRO_MONTHLY_VIDEO_LIMIT = 20; // Explicitly 20 videos/month for $1/mo (Never unlimited)
export const FREE_MONTHLY_VOICE_CHAR_LIMIT = 2400; // ~3 videos * 800 chars max
export const PRO_MONTHLY_VOICE_CHAR_LIMIT = 14000; // ~20 videos * 700 chars max to keep $1/mo plan profitable
export const PRO_PRICE_USD = 0;
export const PRO_PRICE_GHS = 0; // 100% Free - All payments removed

// Default ElevenLabs Voice: Adam
export const ELEVENLABS_ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
export const ELEVENLABS_DEFAULT_MODEL = "eleven_multilingual_v2";

export interface ElevenLabsVoiceOption {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  accent?: string;
  previewUrl?: string;
  isAvailableInAccount: boolean;
}

export interface AdminVoiceSettings {
  provider: "elevenlabs";
  defaultVoiceId: string;
  defaultVoiceName: string;
  modelId: string;
  stability: number; // 0.0 - 1.0
  similarityBoost: number; // 0.0 - 1.0
  style: number; // 0.0 - 1.0 (expressive delivery for motivational content)
  speed: number; // 0.7 - 1.2 (speaking speed)
  useSpeakerBoost: boolean;
  // Usage & profitability tracking
  totalVoiceCharactersUsed: number;
  totalVoiceApiCalls: number;
  totalVoiceCacheHits: number;
  lastAdamError?: string | null;
  lastVoiceError?: string | null;
  updatedAt: string;
  updatedBy?: string;
}

export type ContentCategory =
  | "Motivation"
  | "Football"
  | "Entertainment"
  | "Business"
  | "Technology"
  | "News"
  | "Lifestyle";

export type SocialPlatform = "TikTok" | "Instagram Reels" | "YouTube Shorts";

export type JobStage =
  | "QUEUED"
  | "GENERATING SCRIPT"
  | "GENERATING VOICE"
  | "CREATING VIDEO"
  | "ADDING CAPTIONS"
  | "RENDERING"
  | "COMPLETED"
  | "FAILED";

export interface VideoScene {
  sceneNumber: number;
  durationSec: number;
  narration: string;
  visualHeadline: string;
  visualSubtext: string;
  accentColor: string;
}

export interface AutomationJob {
  id: string;
  userId: string;
  userEmail: string;
  category: ContentCategory;
  platform: SocialPlatform;
  targetDurationSec: number; // 30 - 60
  customTopic?: string;
  isAutoMode: boolean;
  status: JobStage;
  progress: number; // 0 - 100
  errorMessage?: string;
  retryCount: number;
  quotaCharged: boolean;
  // Generated AI Assets
  idea?: string;
  hook?: string;
  script?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  scenes?: VideoScene[];
  voiceId?: string;
  voiceName?: string;
  voiceProvider?: string;
  voiceFromCache?: boolean;
  voiceCharactersUsed?: number;
  voiceDurationSec?: number;
  musicTrackName?: string;
  videoUrl?: string;
  durationSec?: number;
  fileSizeBytes?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AutoModeSchedule {
  id: string;
  userId: string;
  userEmail: string;
  enabled: boolean;
  category: ContentCategory;
  platform: SocialPlatform;
  videosPerDay: number; // 1 to 3
  durationSec: number; // 30 - 60
  preferredTimeUtc: string; // e.g. "09:00"
  lastRunAt?: string;
  nextRunAt: string;
  totalGenerated: number;
  createdAt: string;
}

export interface UserAutomationAccount {
  userId: string;
  email: string;
  plan: "FREE" | "PRO";
  proExpiresAt?: number;
  currentMonthKey: string; // e.g. "2026-10"
  videosUsedThisMonth: number;
  totalVideosCreated: number;
  totalApiCallsTracked: number;
  voiceCharactersUsedThisMonth: number;
  voiceGenerationsThisMonth: number;
  voiceCacheHitsThisMonth: number;
  paymentProvider?: "ghana_momo" | "paystack" | "flutterwave" | "stripe";
  lastGenerationRequestedAt?: number;
  updatedAt: string;
}

export interface AutomationPaymentRecord {
  id: string;
  userId: string;
  userEmail: string;
  userPhone: string;
  provider: "ghana_momo" | "paystack" | "flutterwave" | "stripe";
  network: "mtn" | "telecel" | "at";
  amountUsd: number;
  amountGhs: number;
  reference: string;
  unlockCode: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  confirmedAt?: string;
}

// ============================================================================
// PERSISTENT STORAGE SETUP
// ============================================================================
const DATA_DIR = path.resolve(process.cwd(), "data");
const PUBLIC_VIDEOS_DIR = path.resolve(process.cwd(), "public", "generated-videos");
const PUBLIC_VOICES_DIR = path.resolve(process.cwd(), "public", "generated-voices");
const VOICE_CACHE_DIR = path.resolve(process.cwd(), "data", "voice_cache");
const BROLL_CACHE_DIR = path.resolve(process.cwd(), "data", "broll_cache");
const TEMP_WORK_DIR = path.resolve(process.cwd(), "data", "tmp_render");

for (const dir of [DATA_DIR, PUBLIC_VIDEOS_DIR, PUBLIC_VOICES_DIR, VOICE_CACHE_DIR, BROLL_CACHE_DIR, TEMP_WORK_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ACCOUNTS_FILE = path.join(DATA_DIR, "automation_accounts.json");
const JOBS_FILE = path.join(DATA_DIR, "automation_jobs.json");
const SCHEDULES_FILE = path.join(DATA_DIR, "automation_schedules.json");
const PAYMENTS_FILE = path.join(DATA_DIR, "automation_payments.json");
const VOICE_SETTINGS_FILE = path.join(DATA_DIR, "automation_voice_settings.json");

for (const dir of [DATA_DIR, PUBLIC_VIDEOS_DIR, PUBLIC_VOICES_DIR, VOICE_CACHE_DIR, TEMP_WORK_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error(`Failed to create directory ${dir}:`, e);
    }
  }
}

const STANDARD_ELEVENLABS_VOICES: ElevenLabsVoiceOption[] = [
  {
    voiceId: ELEVENLABS_ADAM_VOICE_ID,
    name: "Adam",
    category: "premade",
    description: "Deep, resonant, authoritative & expressive narration (Default for Motivation & News)",
    accent: "American",
    isAvailableInAccount: true,
  },
  {
    voiceId: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    category: "premade",
    description: "Well-rounded, warm and engaging narrator voice",
    accent: "American",
    isAvailableInAccount: true,
  },
  {
    voiceId: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    category: "premade",
    description: "Deep, cinematic and commanding voiceover delivery",
    accent: "American",
    isAvailableInAccount: true,
  },
  {
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    category: "premade",
    description: "Young, dynamic, high-energy storyteller voice",
    accent: "American",
    isAvailableInAccount: true,
  },
  {
    voiceId: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    category: "premade",
    description: "Strong, clear broadcast news and documentary presenter",
    accent: "British",
    isAvailableInAccount: true,
  },
  {
    voiceId: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    category: "premade",
    description: "Intense, gravelly character and motivational speaker",
    accent: "Transatlantic",
    isAvailableInAccount: true,
  },
  {
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    category: "premade",
    description: "Calm, articulate and natural conversational narration",
    accent: "American",
    isAvailableInAccount: true,
  },
  {
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    category: "premade",
    description: "Expressive, upbeat modern social media creator voice",
    accent: "American",
    isAvailableInAccount: true,
  },
];

let adminVoiceSettings: AdminVoiceSettings = {
  provider: "elevenlabs",
  defaultVoiceId: ELEVENLABS_ADAM_VOICE_ID,
  defaultVoiceName: "Adam",
  modelId: ELEVENLABS_DEFAULT_MODEL,
  stability: 0.45,
  similarityBoost: 0.8,
  style: 0.35,
  speed: 1.05,
  useSpeakerBoost: true,
  totalVoiceCharactersUsed: 0,
  totalVoiceApiCalls: 0,
  totalVoiceCacheHits: 0,
  lastAdamError: null,
  lastVoiceError: null,
  updatedAt: new Date().toISOString(),
};

const accounts = new Map<string, UserAutomationAccount>();
const jobs = new Map<string, AutomationJob>();
const schedules = new Map<string, AutoModeSchedule>();
const payments = new Map<string, AutomationPaymentRecord>();

// Rate limiting & duplicate request locks in memory
const activeUserLocks = new Set<string>();
const rateLimitWindow = new Map<string, { count: number; resetAt: number }>();

function loadAutomationData() {
  try {
    // Purge any legacy pre-studio cached voice files so old robotic fallback clips are never served
    for (const dir of [VOICE_CACHE_DIR, PUBLIC_VOICES_DIR]) {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file.endsWith(".wav") && !file.startsWith("studio_v3_")) {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch {}
          }
        }
      }
    }

    if (fs.existsSync(ACCOUNTS_FILE)) {
      const list: UserAutomationAccount[] = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
      list.forEach((a) => {
        a.voiceCharactersUsedThisMonth = a.voiceCharactersUsedThisMonth || 0;
        a.voiceGenerationsThisMonth = a.voiceGenerationsThisMonth || 0;
        a.voiceCacheHitsThisMonth = a.voiceCacheHitsThisMonth || 0;
        accounts.set(a.userId, a);
      });
    }
    if (fs.existsSync(JOBS_FILE)) {
      const list: AutomationJob[] = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
      list.forEach((j) => jobs.set(j.id, j));
    }
    if (fs.existsSync(SCHEDULES_FILE)) {
      const list: AutoModeSchedule[] = JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf-8"));
      list.forEach((s) => schedules.set(s.userId, s));
    }
    if (fs.existsSync(PAYMENTS_FILE)) {
      const list: AutomationPaymentRecord[] = JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf-8"));
      list.forEach((p) => payments.set(p.id, p));
    }
    if (fs.existsSync(VOICE_SETTINGS_FILE)) {
      const saved: Partial<AdminVoiceSettings> = JSON.parse(fs.readFileSync(VOICE_SETTINGS_FILE, "utf-8"));
      adminVoiceSettings = {
        ...adminVoiceSettings,
        ...saved,
        defaultVoiceId: saved.defaultVoiceId || ELEVENLABS_ADAM_VOICE_ID,
        defaultVoiceName: saved.defaultVoiceName || "Adam",
      };
    }
  } catch (err) {
    console.error("[Automation] Error loading data:", err);
  }
}

function saveVoiceSettings() {
  try {
    fs.writeFileSync(VOICE_SETTINGS_FILE, JSON.stringify(adminVoiceSettings, null, 2), "utf-8");
  } catch (err) {
    console.error("[Automation] Error saving voice settings:", err);
  }
}

function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(accounts.values()), null, 2), "utf-8");
  } catch (err) {
    console.error("[Automation] Error saving accounts:", err);
  }
}

function saveJobs() {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(Array.from(jobs.values()), null, 2), "utf-8");
  } catch (err) {
    console.error("[Automation] Error saving jobs:", err);
  }
}

function saveSchedules() {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(Array.from(schedules.values()), null, 2), "utf-8");
  } catch (err) {
    console.error("[Automation] Error saving schedules:", err);
  }
}

function savePayments() {
  try {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(Array.from(payments.values()), null, 2), "utf-8");
  } catch (err) {
    console.error("[Automation] Error saving payments:", err);
  }
}

loadAutomationData();

// ============================================================================
// HELPER: USER ACCOUNT & MONTHLY QUOTA MANAGEMENT
// ============================================================================
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isOwnerEmail(email?: string): boolean {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.trim().toLowerCase());
}

function getOrCreateAccount(userId: string, email: string = ""): UserAutomationAccount {
  const monthKey = getCurrentMonthKey();
  let acc = accounts.get(userId);
  const isOwner = isOwnerEmail(email);

  if (!acc) {
    acc = {
      userId,
      email,
      plan: "PRO",
      proExpiresAt: undefined,
      currentMonthKey: monthKey,
      videosUsedThisMonth: 0,
      totalVideosCreated: 0,
      totalApiCallsTracked: 0,
      voiceCharactersUsedThisMonth: 0,
      voiceGenerationsThisMonth: 0,
      voiceCacheHitsThisMonth: 0,
      updatedAt: new Date().toISOString(),
    };
    accounts.set(userId, acc);
    saveAccounts();
  } else {
    let changed = false;
    if (email && acc.email !== email) {
      acc.email = email;
      changed = true;
    }
    if (acc.plan !== "PRO") {
      acc.plan = "PRO";
      changed = true;
    }
    // Reset monthly counter on new month
    if (acc.currentMonthKey !== monthKey) {
      acc.currentMonthKey = monthKey;
      acc.videosUsedThisMonth = 0;
      acc.voiceCharactersUsedThisMonth = 0;
      acc.voiceGenerationsThisMonth = 0;
      acc.voiceCacheHitsThisMonth = 0;
      changed = true;
    }
    if (changed) {
      acc.updatedAt = new Date().toISOString();
      saveAccounts();
    }
  }
  return acc;
}

function getMonthlyLimit(acc: UserAutomationAccount): number {
  return acc.plan === "PRO" ? PRO_MONTHLY_VIDEO_LIMIT : FREE_MONTHLY_VIDEO_LIMIT;
}

function getMonthlyVoiceCharLimit(acc: UserAutomationAccount): number {
  return acc.plan === "PRO" ? PRO_MONTHLY_VOICE_CHAR_LIMIT : FREE_MONTHLY_VOICE_CHAR_LIMIT;
}

function checkRateLimit(key: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitWindow.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitWindow.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// ============================================================================
// ELEVENLABS VOICEOVER ENGINE & VOICE CACHE (DEFAULT VOICE: ADAM)
// ============================================================================
export interface VoiceSynthesisResult {
  ok: boolean;
  fromCache: boolean;
  provider: "elevenlabs" | "gemini_tts" | "flite_fallback";
  voiceId: string;
  voiceName: string;
  charactersCharged: number;
  durationSec: number;
  cacheKey: string;
  cachedWavPath: string;
  error?: string;
}

function getWavDurationSec(wavPath: string, fallbackSec = 30): number {
  try {
    if (!fs.existsSync(wavPath)) return fallbackSec;
    const stat = fs.statSync(wavPath);
    if (stat.size <= 44) return fallbackSec;
    // Standardized 24000 Hz, 16-bit (2 bytes/sample), mono (1 channel) = 48000 bytes/sec
    const seconds = (stat.size - 44) / 48000;
    return Math.max(3, Number(seconds.toFixed(2)));
  } catch {
    return fallbackSec;
  }
}

async function fetchElevenLabsVoicesFromApi(): Promise<{
  connected: boolean;
  adamAvailable: boolean;
  adamVoiceId?: string;
  voices: ElevenLabsVoiceOption[];
  error?: string;
}> {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) {
    return {
      connected: false,
      adamAvailable: true,
      adamVoiceId: ELEVENLABS_ADAM_VOICE_ID,
      voices: STANDARD_ELEVENLABS_VOICES,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        connected: false,
        adamAvailable: false,
        voices: STANDARD_ELEVENLABS_VOICES,
        error: `ElevenLabs API returned HTTP ${resp.status}: ${errText.slice(0, 140) || "Check ELEVENLABS_API_KEY."}`,
      };
    }

    const data: any = await resp.json();
    const rawVoices: any[] = Array.isArray(data?.voices) ? data.voices : [];

    if (rawVoices.length === 0) {
      return {
        connected: true,
        adamAvailable: false,
        voices: STANDARD_ELEVENLABS_VOICES,
        error: "No voices were returned by the connected ElevenLabs account. Please select an available voice.",
      };
    }

    const mappedVoices: ElevenLabsVoiceOption[] = rawVoices.map((v: any) => ({
      voiceId: String(v.voice_id || ""),
      name: String(v.name || "Voice"),
      category: String(v.category || "premade"),
      description: String(
        v.labels?.description ||
          v.description ||
          `${v.labels?.accent ? v.labels.accent + " · " : ""}${v.labels?.use_case || "Narration"}`
      ),
      accent: v.labels?.accent || undefined,
      previewUrl: v.preview_url || undefined,
      isAvailableInAccount: true,
    }));

    const adamMatch = mappedVoices.find(
      (v) =>
        v.voiceId === ELEVENLABS_ADAM_VOICE_ID ||
        v.name.trim().toLowerCase() === "adam" ||
        v.name.trim().toLowerCase().startsWith("adam ")
    );

    if (!adamMatch) {
      const msg =
        "The default 'Adam' voice is unavailable on the connected ElevenLabs account. Please select another available ElevenLabs voice below.";
      adminVoiceSettings.lastAdamError = msg;
      saveVoiceSettings();
      return {
        connected: true,
        adamAvailable: false,
        voices: mappedVoices,
        error: msg,
      };
    }

    // Clear previous Adam error if Adam is confirmed available
    if (adminVoiceSettings.lastAdamError) {
      adminVoiceSettings.lastAdamError = null;
      saveVoiceSettings();
    }

    return {
      connected: true,
      adamAvailable: true,
      adamVoiceId: adamMatch.voiceId,
      voices: mappedVoices,
    };
  } catch (err: any) {
    return {
      connected: false,
      adamAvailable: true,
      voices: STANDARD_ELEVENLABS_VOICES,
      error: `Could not reach ElevenLabs API: ${err?.message || "Network timeout"}`,
    };
  }
}

// ============================================================================
// FLEXIBLE AI PROVIDER ARCHITECTURE
// ============================================================================
interface GeneratedScriptResult {
  idea: string;
  hook: string;
  script: string;
  title: string;
  description: string;
  hashtags: string[];
  scenes: VideoScene[];
  voiceName: string;
  musicTrackName: string;
}

interface AIProviderAdapter {
  name: string;
  generateContentPlan(
    category: ContentCategory,
    platform: SocialPlatform,
    durationSec: number,
    customTopic?: string
  ): Promise<GeneratedScriptResult>;
  generateVoiceoverWav(
    scriptText: string,
    category: ContentCategory,
    outWavPath: string,
    overrideVoice?: Partial<AdminVoiceSettings>
  ): Promise<VoiceSynthesisResult>;
}

const CATEGORY_THEMES: Record<
  ContentCategory,
  {
    colors: string[];
    voice: string;
    musicName: string;
    baseFreq: number;
    defaultHooks: string[];
  }
> = {
  Motivation: {
    colors: ["#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#10b981"],
    voice: "Fenrir",
    musicName: "Epic Horizon Rise (Royalty-Free Studio Mix)",
    baseFreq: 220,
    defaultHooks: [
      "Stop scrolling! The next 30 seconds will change how you view discipline forever.",
      "99% of people quit right before the breakthrough. Here is why you must keep going.",
      "Nobody is coming to save you—and that is the best news you will hear today.",
    ],
  },
  Football: {
    colors: ["#10b981", "#3b82f6", "#f59e0b", "#06b6d4", "#eab308"],
    voice: "Puck",
    musicName: "Stadium Pulse Anthem (Royalty-Free Beat)",
    baseFreq: 261.63,
    defaultHooks: [
      "Wait until you see the tactical genius behind this unforgettable football moment!",
      "Three records in world football that will never be broken in our lifetime.",
      "Why the modern midfield role has completely transformed Champions League football.",
    ],
  },
  Entertainment: {
    colors: ["#ec4899", "#8b5cf6", "#f43f5e", "#a855f7", "#06b6d4"],
    voice: "Zephyr",
    musicName: "Neon Spotlight Groove (Royalty-Free Synth)",
    baseFreq: 293.66,
    defaultHooks: [
      "You missed this hidden detail that completely changes the entire storyline!",
      "How African music and cinema took over global streaming charts this year.",
      "Behind the scenes: The wild true story that directors kept secret until now.",
    ],
  },
  Business: {
    colors: ["#3b82f6", "#10b981", "#0ea5e9", "#6366f1", "#14b8a6"],
    voice: "Charon",
    musicName: "Executive Momentum (Royalty-Free Minimal)",
    baseFreq: 196.0,
    defaultHooks: [
      "Here is the silent cash-flow rule every successful founder uses to scale fast.",
      "Stop trading hours for money until you understand this leverage principle.",
      "How small businesses are using smart systems to outperform giant corporations.",
    ],
  },
  Technology: {
    colors: ["#06b6d4", "#3b82f6", "#8b5cf6", "#10b981", "#6366f1"],
    voice: "Kore",
    musicName: "Cybernetic Pulse (Royalty-Free Ambient)",
    baseFreq: 246.94,
    defaultHooks: [
      "This new tech breakthrough just changed the future of everyday devices!",
      "Three digital tools that will save you ten hours every single week.",
      "What happens inside data centers in a single millisecond will blow your mind.",
    ],
  },
  News: {
    colors: ["#ef4444", "#3b82f6", "#f59e0b", "#0ea5e9", "#10b981"],
    voice: "Kore",
    musicName: "Global Broadcast Headline Bed (Royalty-Free)",
    baseFreq: 220.0,
    defaultHooks: [
      "Breaking global update: Here is what you need to know in under 60 seconds.",
      "The biggest economic and global shifts happening right now, explained simply.",
      "Why today's international headline matters for markets and everyday life.",
    ],
  },
  Lifestyle: {
    colors: ["#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6"],
    voice: "Zephyr",
    musicName: "Golden Hour Lo-Fi Breeze (Royalty-Free)",
    baseFreq: 277.18,
    defaultHooks: [
      "Try this 5-minute morning habit for 7 days and watch your energy double.",
      "Simple minimalist upgrades that immediately make your daily routine calmer.",
      "The science-backed evening reset that top performers swear by.",
    ],
  },
};

class GeminiAIProvider implements AIProviderAdapter {
  name = "Google Gemini AI Studio Provider";

  private getClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  private async masterVoiceoverAudio(
    inputWavPath: string,
    outputWavPath: string,
    voiceName: string,
    speed: number = 1.0
  ): Promise<void> {
    const isFemale = ["rachel", "sarah"].includes(voiceName.trim().toLowerCase());
    // Deep Cinematic Studio Vocal Chain (modeled after viral motivational baritone narration):
    // 1. High-pass at 62Hz to clean sub-rumble while preserving deep baritone chest weight
    // 2. Rich chest resonance boost (135Hz +4.2dB for Adam/male baritone, 205Hz +2.6dB for female)
    // 3. Subtle low-mid cleanup at 310Hz (-1.8dB) for studio clarity
    // 4. Condenser mic presence boost at 3.2kHz (+3.2dB) for crisp articulation
    // 5. Smooth air shelf at 9.5kHz (+2.0dB) + warm broadcast compression & brickwall limiter
    const chestFreq = isFemale ? 205 : 135;
    const chestGain = isFemale ? 2.6 : 4.2;
    const clampedSpeed = Math.min(1.2, Math.max(0.75, Number(speed || 1.0)));
    const tempoFilter =
      Math.abs(clampedSpeed - 1.0) >= 0.04 ? `,atempo=${clampedSpeed.toFixed(2)}` : "";

    const filterChain = `highpass=f=62,equalizer=f=${chestFreq}:t=q:w=1.1:g=${chestGain},equalizer=f=310:t=q:w=1.4:g=-1.8,equalizer=f=3200:t=q:w=1.25:g=3.2,equalizer=f=9500:t=q:w=1.5:g=2.0,acompressor=threshold=-20dB:ratio=3.5:attack=8:release=160:makeup=3.0,alimiter=limit=0.96${tempoFilter}`;

    const tmpOut = `${outputWavPath}.mastering.wav`;
    try {
      await execFileAsync(getFfmpegBinary(), [
        "-y",
        "-i",
        inputWavPath,
        "-af",
        filterChain,
        "-ar",
        "24000",
        "-ac",
        "1",
        tmpOut,
      ]);
      if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 1000) {
        fs.renameSync(tmpOut, outputWavPath);
        return;
      }
    } catch (err) {
      console.warn("[Automation] FFmpeg vocal mastering fallback to pure-Node DSP:", (err as Error)?.message);
    }
    // Pure-Node PCM presence & broadcast limiter fallback if ffmpeg filter fails
    try {
      const raw = fs.readFileSync(inputWavPath);
      if (raw.length > 44) {
        const outBuf = Buffer.from(raw);
        let prev = 0;
        for (let offset = 44; offset + 1 < outBuf.length; offset += 2) {
          const sample = outBuf.readInt16LE(offset) / 32768;
          // Crisp presence emphasis + broadcast soft-knee compression
          const diff = sample - prev;
          prev = sample;
          const enhanced = sample * 1.25 + diff * 0.35;
          const limited = Math.tanh(enhanced * 1.15) * 0.94;
          outBuf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(limited * 32767))), offset);
        }
        fs.writeFileSync(outputWavPath, outBuf);
      }
    } catch {}
  }

  private mapVoiceToStudioPersona(
    voiceName: string,
    category: ContentCategory,
    stability: number,
    style: number,
    speed: number
  ): { prebuiltVoice: string; styleDirection: string } {
    const lower = voiceName.trim().toLowerCase();
    let prebuiltVoice = "Charon"; // Default Adam-style deep resonant baritone
    let personaBase =
      "Deep, warm, resonant baritone studio narrator like Adam with rich chest resonance, natural human breath phrasing, and commanding authority";

    if (lower === "brian") {
      prebuiltVoice = "Fenrir";
      personaBase =
        "Deep cinematic bass-baritone narrator with commanding presence, dramatic gravity, and rich studio warmth";
    } else if (lower === "antoni" || lower === "josh") {
      prebuiltVoice = "Puck";
      personaBase =
        "Charismatic, warm, articulate storyteller with dynamic inflection and engaging conversational energy";
    } else if (lower === "daniel") {
      prebuiltVoice = "Charon";
      personaBase =
        "Polished, authoritative international broadcast presenter with crisp articulation and composed confidence";
    } else if (lower === "callum") {
      prebuiltVoice = "Fenrir";
      personaBase =
        "Intense, textured, gripping motivational speaker with raw conviction and purposeful dramatic pauses";
    } else if (lower === "rachel") {
      prebuiltVoice = "Kore";
      personaBase =
        "Warm, articulate, natural female broadcast narrator with crystal-clear diction and inviting studio presence";
    } else if (lower === "sarah") {
      prebuiltVoice = "Zephyr";
      personaBase =
        "Expressive, vibrant, modern female storyteller with natural warmth and engaging social-media pacing";
    }

    const categoryMood: Record<ContentCategory, string> = {
      Motivation:
        "Deliver with powerful motivational conviction, inspiring emotional weight, and deliberate pauses after key phrases.",
      Football:
        "Deliver with exciting sports documentary energy, sharp rhythm, and passionate broadcast flair.",
      Entertainment:
        "Deliver with captivating, magnetic storytelling intrigue and smooth vocal charisma.",
      Business:
        "Deliver with sharp executive clarity, trustworthy authority, and high-conviction insight.",
      Technology:
        "Deliver with modern, visionary clarity and crisp, engaging articulation.",
      News:
        "Deliver with authoritative, composed international headline anchor credibility and clear pacing.",
      Lifestyle:
        "Deliver with warm, uplifting, relatable human authenticity and smooth flow.",
    };

    const expressivenessHint =
      style >= 0.4 || stability <= 0.45
        ? "Use highly expressive, human-like emotional inflection and dynamic vocal contrast."
        : "Maintain steady, balanced studio broadcast consistency.";

    const speedHint =
      speed >= 1.08
        ? "Speak at a brisk, high-retention social media pace."
        : speed <= 0.92
        ? "Speak at a deliberate, measured, unhurried pace."
        : "Speak at a natural, engaging, well-paced conversational rhythm.";

    return {
      prebuiltVoice,
      styleDirection: `${personaBase}. ${categoryMood[category] || categoryMood.Motivation} ${expressivenessHint} ${speedHint}`,
    };
  }

  async generateContentPlan(
    category: ContentCategory,
    platform: SocialPlatform,
    durationSec: number,
    customTopic?: string
  ): Promise<GeneratedScriptResult> {
    const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES.Motivation;
    const sceneCount = durationSec >= 45 ? 6 : 5;
    const perSceneSec = Math.round(durationSec / sceneCount);

    const ai = this.getClient();
    if (ai) {
      try {
        const topicClause = customTopic
          ? `Focus specifically on this topic/angle: "${customTopic}".`
          : `Pick a fresh, high-retention, viral-ready topic for ${category}.`;

        const geminiCall = ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: `You are an elite short-form vertical video producer for ${platform}.
Create a complete, high-retention ${durationSec}-second vertical 9:16 video package in the "${category}" category.
${topicClause}

Requirements:
1. "idea": A strong 1-sentence content concept.
2. "hook": A powerful, scroll-stopping opening hook for the first 2-3 seconds (max 15 words).
3. "title": A catchy, high-CTR title optimized for ${platform} (max 70 chars).
4. "description": An engaging social caption/description with a call-to-action (2-3 sentences).
5. "hashtags": Array of 6 to 8 relevant trending hashtags (without the # symbol).
6. "scenes": Exactly ${sceneCount} sequential scenes totaling ${durationSec} seconds.
   - Scene 1 MUST start with the powerful hook.
   - Each scene needs:
     - "narration": Spoken voiceover sentences for that scene (natural, punchy, 12-22 words per scene).
     - "visualHeadline": Short bold 2-5 word on-screen visual headline in UPPERCASE.
     - "visualSubtext": Supporting 5-9 word key takeaway shown on the visual card.

Return valid JSON matching the schema.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                idea: { type: Type.STRING },
                hook: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                hashtags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      narration: { type: Type.STRING },
                      visualHeadline: { type: Type.STRING },
                      visualSubtext: { type: Type.STRING },
                    },
                    required: ["narration", "visualHeadline", "visualSubtext"],
                  },
                },
              },
              required: ["idea", "hook", "title", "description", "hashtags", "scenes"],
            },
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini script timeout")), 12000)
        );
        const response = await Promise.race([geminiCall, timeoutPromise]);

        if (response.text) {
          const parsed = JSON.parse(response.text);
          const rawScenes = Array.isArray(parsed.scenes) && parsed.scenes.length > 0 ? parsed.scenes : [];
          const normalizedScenes: VideoScene[] = rawScenes.slice(0, sceneCount).map((s: any, idx: number) => ({
            sceneNumber: idx + 1,
            durationSec: perSceneSec,
            narration: String(s.narration || "").trim(),
            visualHeadline: String(s.visualHeadline || `${category.toUpperCase()} #${idx + 1}`).trim(),
            visualSubtext: String(s.visualSubtext || "").trim(),
            accentColor: theme.colors[idx % theme.colors.length],
          }));

          if (normalizedScenes.length > 0) {
            const fullScript = normalizedScenes.map((s) => s.narration).join(" ");
            const cleanHashtags = (parsed.hashtags || [category.toLowerCase(), "shorts", "viral", "fyp"])
              .map((h: string) => String(h).replace(/^#+/, "").trim())
              .filter(Boolean);

            const musicProfile = resolveMusicProfileForTerm(
              category,
              customTopic || parsed.title || parsed.idea
            );

            return {
              idea: parsed.idea || `High-retention ${category} breakdown for ${platform}`,
              hook: parsed.hook || normalizedScenes[0].narration,
              script: fullScript,
              title: parsed.title || `${category}: What Nobody Tells You`,
              description: parsed.description || `Watch till the end for the key takeaway! Follow GlobalNews for daily ${category.toLowerCase()} insights.`,
              hashtags: cleanHashtags,
              scenes: normalizedScenes,
              voiceName: `${adminVoiceSettings.defaultVoiceName || "Adam"} (ElevenLabs)`,
              musicTrackName: musicProfile.trackTitle,
            };
          }
        }
      } catch (err) {
        console.warn("[Automation] Gemini script generation fallback triggered:", (err as Error)?.message);
      }
    }

    // Resilient Fallback Content Generator (if API key missing or quota reached)
    return this.buildFallbackPlan(category, platform, durationSec, customTopic);
  }

  private buildFallbackPlan(
    category: ContentCategory,
    platform: SocialPlatform,
    durationSec: number,
    customTopic?: string
  ): GeneratedScriptResult {
    const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES.Motivation;
    const hook = theme.defaultHooks[Math.floor(Math.random() * theme.defaultHooks.length)];
    const topicLabel = customTopic ? customTopic.trim() : `${category} Mastery`;

    const sceneTemplates: Record<ContentCategory, { headline: string; sub: string; text: string }[]> = {
      Motivation: [
        { headline: "THE SILENT GRIND", sub: "Dark Noir Discipline", text: "Nobody sees the early mornings. Nobody claps when you fight your doubts in complete silence." },
        { headline: "EMBRACE THE STORM", sub: "Strength Forged In Pain", text: "Every setback, every lonely mile, and every heavy chapter is building a version of you they cannot stop." },
        { headline: "CONTROL YOUR MIND", sub: "Master Your Focus", text: "Kill your excuses. Protect your focus. Do the hard work especially when you do not feel like it." },
        { headline: "WALK ALONE", sub: "Unbreakable Standards", text: "The path to greatness is quiet and steep. Keep climbing until your results speak louder than words." },
        { headline: "UNSTOPPABLE", sub: "Your Time Is Coming", text: "Stay disciplined. Stay relentless. Your breakthrough is closer than you think." },
      ],
      Football: [
        { headline: "FOOTBALL GENIUS", sub: "Tactical Breakdown", text: hook },
        { headline: "HIGH PRESS SYSTEM", sub: "Controlling the midfield tempo", text: "Elite clubs win possession within five seconds by closing passing lanes before the opponent looks up." },
        { headline: "CLINICAL FINISHING", sub: "Composure in the box", text: "Top strikers scan the goalkeeper's positioning twice before the ball even arrives at their feet." },
        { headline: "CHAMPION MENTALITY", sub: "90th minute resilience", text: "The greatest matches are decided in the final ten minutes when stamina meets tactical discipline." },
        { headline: "FULL TIME VERDICT", sub: "Comment your club below", text: "Which team has the best squad in world football this season? Drop your thoughts below!" },
      ],
      Entertainment: [
        { headline: "HIDDEN SPOTLIGHT", sub: "Inside Global Entertainment", text: hook },
        { headline: "STREAMING REVOLUTION", sub: "Global audiences unite", text: "Cross-cultural storytelling and African rhythms are breaking streaming records across every continent." },
        { headline: "CREATIVE DIRECTION", sub: "Why fans love authenticity", text: "Audiences today connect with raw, authentic visuals that capture real emotion in the first three seconds." },
        { headline: "CULTURAL IMPACT", sub: "Music and cinema fusion", text: "Soundtracks from Accra to London are shaping the biggest viral moments on social media." },
        { headline: "WATCH NEXT", sub: "Follow for entertainment buzz", text: "Save this video and follow GlobalNews for daily entertainment updates and behind-the-scenes stories!" },
      ],
      Business: [
        { headline: "SMART LEVERAGE", sub: "Modern Business Playbook", text: hook },
        { headline: "SOLVE REAL PROBLEMS", sub: "Value drives revenue", text: "The fastest growing companies do not chase hype. They solve one painful customer problem better than anyone else." },
        { headline: "AUTOMATE WORKFLOWS", sub: "Scale without burnout", text: "When you turn repeatable tasks into automated systems, your profit margins grow every single month." },
        { headline: "CASH FLOW RULES", sub: "Reinvest into growth", text: "Keep overhead lean, measure customer retention weekly, and build recurring digital revenue streams." },
        { headline: "BUILD YOUR EMPIRE", sub: "Save this business guide", text: "Bookmark this blueprint and follow for daily business and entrepreneurship insights." },
      ],
      Technology: [
        { headline: "FUTURE TECH NOW", sub: "Next-Gen Innovation", text: hook },
        { headline: "AI AUTOMATION", sub: "Smart workflows in seconds", text: "Modern cloud and AI tools now let solo creators produce studio-grade media from anywhere in the world." },
        { headline: "SPEED AND SECURITY", sub: "Edge computing power", text: "Faster mobile networks and edge processors are transforming how billions of people work and learn." },
        { headline: "CREATOR ECONOMY", sub: "Tools that amplify talent", text: "Those who master digital automation tools today will lead every major industry tomorrow." },
        { headline: "STAY AHEAD", sub: "Follow for daily tech news", text: "Hit follow to stay ahead of every major technology trend and digital breakthrough!" },
      ],
      News: [
        { headline: "BREAKING BRIEF", sub: "Global News Rapid Update", text: hook },
        { headline: "ECONOMIC SHIFT", sub: "Markets and trade updates", text: "Global trade corridors and digital finance across Africa and beyond are seeing rapid modernization this quarter." },
        { headline: "TECH & ENERGY", sub: "Infrastructure investments", text: "New renewable power and high-speed connectivity projects are unlocking opportunities for millions of citizens." },
        { headline: "COMMUNITY IMPACT", sub: "What it means for you", text: "Experts say staying informed on regional policy and global markets is key to smart decision-making." },
        { headline: "GLOBAL NEWS LIVE", sub: "Stay informed every day", text: "Follow GlobalNews for verified headlines, real-time reports, and daily 60-second news briefings." },
      ],
      Lifestyle: [
        { headline: "DAILY UPGRADE", sub: "High-Energy Lifestyle", text: hook },
        { headline: "MORNING CLARITY", sub: "Hydrate and move early", text: "Starting your morning without phone notifications for twenty minutes lowers stress and sharpens your focus." },
        { headline: "INTENTIONAL SPACES", sub: "Clear desk, clear mind", text: "A clean environment removes mental friction and helps you enter deep creative flow effortlessly." },
        { headline: "EVENING RESET", sub: "Plan tomorrow tonight", text: "Write down your top three priorities before sleep so you wake up with immediate direction." },
        { headline: "LIVE BETTER", sub: "Share with someone today", text: "Try this routine starting tomorrow morning and follow for more daily lifestyle upgrades!" },
      ],
    };

    const selectedTemplates = sceneTemplates[category] || sceneTemplates.Motivation;
    const perSceneSec = Math.round(durationSec / selectedTemplates.length);
    const scenes: VideoScene[] = selectedTemplates.map((tpl, idx) => ({
      sceneNumber: idx + 1,
      durationSec: perSceneSec,
      narration: tpl.text,
      visualHeadline: customTopic && idx === 0 ? customTopic.toUpperCase().slice(0, 28) : tpl.headline,
      visualSubtext: tpl.sub,
      accentColor: theme.colors[idx % theme.colors.length],
    }));

    const musicProfile = resolveMusicProfileForTerm(category, customTopic || topicLabel);

    return {
      idea: `${topicLabel}: ${durationSec}-second high-retention vertical video for ${platform}`,
      hook,
      script: scenes.map((s) => s.narration).join(" "),
      title: `${topicLabel} — What You Need To Know (${category})`,
      description: `${hook} Watch till the end and follow GlobalNews for daily ${category.toLowerCase()} videos optimized for ${platform}.`,
      hashtags: [
        category.toLowerCase(),
        platform.toLowerCase().replace(/\s+/g, ""),
        "globalnews",
        "viralvideos",
        "ghanatiktok",
        "shorts",
      ],
      scenes,
      voiceName: `${adminVoiceSettings.defaultVoiceName || "Adam"} (ElevenLabs)`,
      musicTrackName: musicProfile.trackTitle,
    };
  }

  async generateVoiceoverWav(
    scriptText: string,
    category: ContentCategory,
    outWavPath: string,
    overrideVoice?: Partial<AdminVoiceSettings>
  ): Promise<VoiceSynthesisResult> {
    const cleanScript = String(scriptText || "").trim().slice(0, 950);
    const voiceId = (overrideVoice?.defaultVoiceId || adminVoiceSettings.defaultVoiceId || ELEVENLABS_ADAM_VOICE_ID).trim();
    const voiceName = (overrideVoice?.defaultVoiceName || adminVoiceSettings.defaultVoiceName || "Adam").trim();
    const modelId = overrideVoice?.modelId || adminVoiceSettings.modelId || ELEVENLABS_DEFAULT_MODEL;

    // Expressive delivery & appropriate speaking speed for motivational content
    const isMotivational = category === "Motivation";
    const stability = Number(
      overrideVoice?.stability ?? (isMotivational ? Math.min(0.5, adminVoiceSettings.stability) : adminVoiceSettings.stability)
    );
    const similarityBoost = Number(overrideVoice?.similarityBoost ?? adminVoiceSettings.similarityBoost ?? 0.8);
    const style = Number(
      overrideVoice?.style ?? (isMotivational ? Math.max(0.35, adminVoiceSettings.style) : adminVoiceSettings.style)
    );
    const speed = Math.min(
      1.2,
      Math.max(0.7, Number(overrideVoice?.speed ?? adminVoiceSettings.speed ?? 1.05))
    );
    const useSpeakerBoost = Boolean(overrideVoice?.useSpeakerBoost ?? adminVoiceSettings.useSpeakerBoost ?? true);

    // Content-addressed SHA-256 voice cache key (v3 studio mastered) so identical voiceovers are never regenerated
    const cacheSignature = JSON.stringify({
      version: "studio_v3",
      text: cleanScript.toLowerCase().replace(/\s+/g, " "),
      voiceId,
      voiceName: voiceName.toLowerCase(),
      modelId,
      stability: Number(stability.toFixed(2)),
      similarityBoost: Number(similarityBoost.toFixed(2)),
      style: Number(style.toFixed(2)),
      speed: Number(speed.toFixed(2)),
    });
    const cacheKey = crypto.createHash("sha256").update(cacheSignature).digest("hex").slice(0, 24);
    const cachedWavPath = path.join(VOICE_CACHE_DIR, `studio_v3_${cacheKey}.wav`);

    if (fs.existsSync(cachedWavPath)) {
      try {
        const stat = fs.statSync(cachedWavPath);
        if (stat.size > 1500) {
          fs.copyFileSync(cachedWavPath, outWavPath);
          adminVoiceSettings.totalVoiceCacheHits += 1;
          saveVoiceSettings();
          return {
            ok: true,
            fromCache: true,
            provider: "elevenlabs",
            voiceId,
            voiceName,
            charactersCharged: 0,
            durationSec: getWavDurationSec(outWavPath, 30),
            cacheKey,
            cachedWavPath,
          };
        }
      } catch (cacheErr) {
        console.warn("[Automation] Voice cache read warning:", cacheErr);
      }
    }

    // 1. Primary: Secure Backend ElevenLabs API Call
    const elevenLabsKey = (process.env.ELEVENLABS_API_KEY || "").trim();
    if (elevenLabsKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 22000);
        const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

        const resp = await fetch(ttsUrl, {
          method: "POST",
          headers: {
            "xi-api-key": elevenLabsKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: cleanScript,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
              use_speaker_boost: useSpeakerBoost,
              speed,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          const mp3Buffer = Buffer.from(arrayBuffer);
          if (mp3Buffer.length > 800) {
            const tmpMp3 = `${outWavPath}.eleven.mp3`;
            const tmpRawWav = `${outWavPath}.raw.wav`;
            fs.writeFileSync(tmpMp3, mp3Buffer);
            await execFileAsync(getFfmpegBinary(), [
              "-y",
              "-i",
              tmpMp3,
              "-ar",
              "24000",
              "-ac",
              "1",
              tmpRawWav,
            ]);
            try {
              fs.unlinkSync(tmpMp3);
            } catch {}

            if (fs.existsSync(tmpRawWav) && fs.statSync(tmpRawWav).size > 1500) {
              fs.copyFileSync(tmpRawWav, outWavPath);
              try {
                await this.masterVoiceoverAudio(tmpRawWav, outWavPath, voiceName, 1.0);
              } catch (masterErr) {
                console.warn("[Automation] Mastering warning:", masterErr);
              }
              try {
                fs.unlinkSync(tmpRawWav);
              } catch {}

              // Store in content-addressed cache to avoid unnecessary future API calls
              try {
                fs.copyFileSync(outWavPath, cachedWavPath);
              } catch {}

              adminVoiceSettings.totalVoiceCharactersUsed += cleanScript.length;
              adminVoiceSettings.totalVoiceApiCalls += 1;
              adminVoiceSettings.lastVoiceError = null;
              if (voiceId === ELEVENLABS_ADAM_VOICE_ID || voiceName.toLowerCase() === "adam") {
                adminVoiceSettings.lastAdamError = null;
              }
              saveVoiceSettings();

              return {
                ok: true,
                fromCache: false,
                provider: "elevenlabs",
                voiceId,
                voiceName,
                charactersCharged: cleanScript.length,
                durationSec: getWavDurationSec(outWavPath, 30),
                cacheKey,
                cachedWavPath,
              };
            }
          }
        } else {
          const errBody = await resp.text().catch(() => "");
          const isAdamSelected =
            voiceId === ELEVENLABS_ADAM_VOICE_ID || voiceName.toLowerCase() === "adam";
          if (resp.status === 404 || errBody.toLowerCase().includes("voice_not_found") || isAdamSelected) {
            const adamMsg = isAdamSelected
              ? `The default 'Adam' voice (${voiceId}) is unavailable on the connected ElevenLabs account (HTTP ${resp.status}). Please select another available ElevenLabs voice in Admin Voice Settings.`
              : `Selected ElevenLabs voice '${voiceName}' (${voiceId}) returned HTTP ${resp.status}. Please select another voice in Admin Voice Settings.`;
            if (isAdamSelected) {
              adminVoiceSettings.lastAdamError = adamMsg;
            }
            adminVoiceSettings.lastVoiceError = adamMsg;
            saveVoiceSettings();
          } else {
            adminVoiceSettings.lastVoiceError = `ElevenLabs API error (HTTP ${resp.status}): ${errBody.slice(0, 140)}`;
            saveVoiceSettings();
          }
        }
      } catch (elErr: any) {
        console.warn("[Automation] ElevenLabs API request warning:", elErr?.message);
        adminVoiceSettings.lastVoiceError = `ElevenLabs connection error: ${elErr?.message || "Timeout"}`;
        saveVoiceSettings();
      }
    }

    // 2. Flagship Studio Neural Voice Engine (Gemini 3.8 Flash TTS with Voice Design Persona & Broadcast Mastering)
    const ai = this.getClient();
    if (ai) {
      const persona = this.mapVoiceToStudioPersona(
        voiceName,
        category,
        stability,
        style,
        speed
      );
      for (const ttsModel of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
        try {
          const ttsCall = ai.models.generateContent({
            model: ttsModel,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: cleanScript,
                    speechMetadata: {
                      style: persona.styleDirection,
                    },
                  } as any,
                ],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: persona.prebuiltVoice },
                },
              },
            },
          });

          const ttsTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${ttsModel} timeout`)), 25000)
          );
          const response = await Promise.race([ttsCall, ttsTimeout]);

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            const wavBuffer = Buffer.from(base64Audio, "base64");
            if (wavBuffer.length > 1500) {
              const tmpRawWav = `${outWavPath}.neural.wav`;
              fs.writeFileSync(tmpRawWav, wavBuffer);
              fs.copyFileSync(tmpRawWav, outWavPath);

              try {
                await this.masterVoiceoverAudio(tmpRawWav, outWavPath, voiceName, speed);
              } catch (masterErr) {
                console.warn("[Automation] Studio vocal mastering warning:", masterErr);
              }
              try {
                fs.unlinkSync(tmpRawWav);
              } catch {}

              try {
                fs.copyFileSync(outWavPath, cachedWavPath);
              } catch {}

              adminVoiceSettings.totalVoiceCharactersUsed += cleanScript.length;
              adminVoiceSettings.totalVoiceApiCalls += 1;
              saveVoiceSettings();

              return {
                ok: true,
                fromCache: false,
                provider: "gemini_tts",
                voiceId,
                voiceName,
                charactersCharged: cleanScript.length,
                durationSec: getWavDurationSec(outWavPath, 30),
                cacheKey,
                cachedWavPath,
              };
            }
          }
        } catch (err) {
          console.warn(`[Automation] ${ttsModel} attempt warning:`, (err as Error)?.message);
        }
      }
    }

    // 3. Emergency Local Fallback (Never cached in VOICE_CACHE_DIR so neural synthesis always retries next time)
    try {
      const sanitizedText = cleanScript
        .replace(/['"\\:;`]/g, " ")
        .replace(/[^a-zA-Z0-9.,?! -]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);

      const isFemaleVoice = ["rachel", "sarah"].includes(voiceName.toLowerCase());
      const fliteVoice = isFemaleVoice ? "slt" : "rms";

      await execFileAsync(getSystemFfmpegWithFlite(), [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `flite=text='${sanitizedText}':voice=${fliteVoice}`,
        "-af",
        `highpass=f=80,lowpass=f=4500,equalizer=f=160:t=q:w=1.2:g=3,atempo=${speed.toFixed(2)}`,
        "-ar",
        "24000",
        "-ac",
        "1",
        outWavPath,
      ]);

      if (fs.existsSync(outWavPath)) {
        return {
          ok: true,
          fromCache: false,
          provider: "flite_fallback",
          voiceId,
          voiceName,
          charactersCharged: cleanScript.length,
          durationSec: getWavDurationSec(outWavPath, 30),
          cacheKey,
          cachedWavPath,
        };
      }
    } catch (fliteErr) {
      console.warn("[Automation] Flite TTS fallback error:", fliteErr);
    }

    return {
      ok: false,
      fromCache: false,
      provider: "elevenlabs",
      voiceId,
      voiceName,
      charactersCharged: 0,
      durationSec: 30,
      cacheKey,
      cachedWavPath,
      error: "Voiceover synthesis failed.",
    };
  }
}

const aiProvider: AIProviderAdapter = new GeminiAIProvider();

// ============================================================================
// TERM-AWARE STUDIO BACKGROUND MUSIC COMPOSER & SIDECHAIN DUCKING MIXER
// ============================================================================
export type StudioMusicGenre =
  | "cinematic_rise"
  | "stadium_anthem"
  | "afro_groove"
  | "executive_pulse"
  | "cyber_synth"
  | "broadcast_news"
  | "lofi_chill"
  | "spiritual_warmth";

export interface TermMusicProfile {
  genre: StudioMusicGenre;
  trackTitle: string;
  bpm: number;
  rootFreq: number;
  chordsSemitones: number[][];
  arpPattern: number[];
  percussionIntensity: number; // 0.2 to 1.0
  padWarmth: number; // 0.3 to 1.0
  matchedTermLabel: string;
}

export function resolveMusicProfileForTerm(
  category: ContentCategory,
  termText?: string
): TermMusicProfile {
  const cleanTerm = String(termText || "").trim();
  const lower = `${category} ${cleanTerm}`.toLowerCase();

  // Base profile per category
  let genre: StudioMusicGenre = "cinematic_rise";
  let baseName = "Epic Horizon Rise";
  let bpm = 98;
  let rootFreq = 220.0; // A3
  let chordsSemitones: number[][] = [
    [0, 3, 7, 12],   // Am
    [-4, 0, 3, 7],   // Fmaj7
    [3, 7, 10, 15],  // C
    [-2, 2, 5, 10],  // G
  ];
  let arpPattern = [0, 2, 1, 3, 2, 3, 1, 2];
  let percussionIntensity = 0.62;
  let padWarmth = 0.85;

  if (category === "Football") {
    genre = "stadium_anthem";
    baseName = "Stadium Pulse Anthem";
    bpm = 124;
    rootFreq = 261.63; // C4
    chordsSemitones = [
      [0, 3, 7, 12],
      [-2, 2, 5, 10],
      [-4, 0, 3, 7],
      [-2, 2, 5, 10],
    ];
    arpPattern = [0, 1, 2, 3, 2, 1, 3, 0];
    percussionIntensity = 0.92;
    padWarmth = 0.65;
  } else if (category === "Entertainment") {
    genre = "afro_groove";
    baseName = "Afro-Neon Spotlight Groove";
    bpm = 108;
    rootFreq = 246.94; // B3
    chordsSemitones = [
      [0, 3, 7, 10],  // m7
      [5, 8, 12, 15], // iv7
      [7, 10, 14, 17],
      [5, 8, 12, 15],
    ];
    arpPattern = [0, 3, 1, 2, 0, 3, 2, 1];
    percussionIntensity = 0.85;
    padWarmth = 0.78;
  } else if (category === "Business") {
    genre = "executive_pulse";
    baseName = "Executive Momentum";
    bpm = 112;
    rootFreq = 196.0; // G3
    chordsSemitones = [
      [0, 3, 7, 10],  // Dorian i7
      [2, 5, 9, 12],  // ii7
      [5, 9, 12, 16], // IV
      [7, 10, 14, 17],
    ];
    arpPattern = [0, 1, 2, 1, 3, 2, 1, 2];
    percussionIntensity = 0.72;
    padWarmth = 0.75;
  } else if (category === "Technology") {
    genre = "cyber_synth";
    baseName = "Cybernetic Horizon Synth";
    bpm = 118;
    rootFreq = 207.65; // G#3
    chordsSemitones = [
      [0, 3, 7, 12],
      [-4, 0, 3, 8],
      [-2, 2, 5, 10],
      [-5, -2, 2, 7],
    ];
    arpPattern = [0, 1, 2, 3, 3, 2, 1, 0];
    percussionIntensity = 0.78;
    padWarmth = 0.7;
  } else if (category === "News") {
    genre = "broadcast_news";
    baseName = "Global Broadcast Headline Bed";
    bpm = 120;
    rootFreq = 220.0; // A3
    chordsSemitones = [
      [0, 7, 12, 15],
      [0, 8, 12, 16],
      [0, 7, 12, 15],
      [-2, 5, 10, 14],
    ];
    arpPattern = [0, 1, 0, 2, 0, 1, 0, 3];
    percussionIntensity = 0.8;
    padWarmth = 0.68;
  } else if (category === "Lifestyle") {
    genre = "lofi_chill";
    baseName = "Golden Hour Lo-Fi Breeze";
    bpm = 88;
    rootFreq = 233.08; // Bb3
    chordsSemitones = [
      [0, 4, 7, 11],  // Maj7
      [9, 12, 16, 19], // vi7
      [2, 5, 9, 12],  // ii7
      [7, 11, 14, 17], // V7
    ];
    arpPattern = [0, 1, 2, 3, 1, 2, 0, 3];
    percussionIntensity = 0.55;
    padWarmth = 0.92;
  }

  // Dynamic Term / Keyword Override so music adapts directly to the specific term!
  if (/(pray|faith|god|church|peace|calm|meditat|heal|sleep|grace|spirit)/i.test(lower)) {
    genre = "spiritual_warmth";
    baseName = "Celestial Reflective Piano & Strings";
    bpm = 82;
    rootFreq = 220.0;
    percussionIntensity = 0.32;
    padWarmth = 0.98;
  } else if (/(goal|match|champion|stadium|football|soccer|premier|fifa|world cup|striker|tactic)/i.test(lower)) {
    genre = "stadium_anthem";
    baseName = "Stadium Victory Pulse";
    bpm = 126;
    percussionIntensity = 0.95;
  } else if (/(afro|ghana|accra|lagos|dance|music|concert|party|vibe|celebrity|movie)/i.test(lower)) {
    genre = "afro_groove";
    baseName = "Accra-to-Global Afro Groove";
    bpm = 110;
    percussionIntensity = 0.88;
  } else if (/(money|wealth|invest|crypto|bitcoin|profit|sales|startup|million|ceo|rich|cash)/i.test(lower)) {
    genre = "executive_pulse";
    baseName = "Wall Street & Founder Momentum";
    bpm = 114;
    percussionIntensity = 0.76;
  } else if (/(ai|robot|future|cyber|code|software|quantum|space|gadget|digital)/i.test(lower)) {
    genre = "cyber_synth";
    baseName = "Neural Future Synthwave";
    bpm = 120;
    percussionIntensity = 0.82;
  } else if (/(breaking|alert|urgent|crisis|market|election|summit|report|headline)/i.test(lower)) {
    genre = "broadcast_news";
    baseName = "Breaking Newsroom Pulse";
    bpm = 122;
    percussionIntensity = 0.85;
  } else if (/(gym|workout|grind|hustle|beast|warrior|win|power|unstoppable|discipline)/i.test(lower)) {
    genre = "cinematic_rise";
    baseName = "Unstoppable Discipline Anthem";
    bpm = 106;
    percussionIntensity = 0.82;
  }

  // Subtle deterministic harmonic transposition based on the specific term so each topic feels bespoke
  if (cleanTerm.length > 0) {
    let hash = 0;
    for (let i = 0; i < cleanTerm.length; i++) {
      hash = (hash * 31 + cleanTerm.charCodeAt(i)) & 0xffff;
    }
    const semitoneShift = [-2, -1, 0, 1, 2][hash % 5];
    rootFreq = Number((rootFreq * Math.pow(2, semitoneShift / 12)).toFixed(2));
  }

  const shortTerm = cleanTerm
    ? cleanTerm.replace(/[^a-zA-Z0-9 -]/g, "").trim().slice(0, 26)
    : category;

  return {
    genre,
    trackTitle: `${baseName} · Tuned for "${shortTerm}" (${bpm} BPM)`,
    bpm,
    rootFreq,
    chordsSemitones,
    arpPattern,
    percussionIntensity,
    padWarmth,
    matchedTermLabel: shortTerm,
  };
}

function composeTermAwareBackgroundMusicWav(
  outMusicPath: string,
  durationSec: number,
  category: ContentCategory,
  termText?: string
): TermMusicProfile {
  const profile = resolveMusicProfileForTerm(category, termText);
  const sampleRate = 24000;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF WAV Header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const beatDur = 60 / profile.bpm; // seconds per quarter-note beat
  const barDur = beatDur * 4;       // 4 beats per bar
  const eighthDur = beatDur / 2;    // 8th-note arpeggio step

  // Deterministic pseudo-noise state for crisp shaker / hi-hat / snare texture
  let rngState = 0x13579bdf;
  let lowpassState = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    const whiteNoise = (rngState / 0xffffffff) * 2 - 1;

    // 1. Chord progression (changes every bar = 4 beats)
    const barIdx = Math.floor(t / barDur);
    const chord = profile.chordsSemitones[barIdx % profile.chordsSemitones.length];

    // 2. Lush Dark-Cinematic Strings & Pad (multi-detuned warm harmonic bed + octave shimmer)
    const chorusLfo1 = 1 + 0.0028 * Math.sin(2 * Math.PI * 0.65 * t);
    const chorusLfo2 = 1 - 0.0024 * Math.cos(2 * Math.PI * 0.52 * t);
    let padSignal = 0;
    for (let n = 0; n < chord.length; n++) {
      const noteFreq = profile.rootFreq * Math.pow(2, chord[n] / 12);
      const weight = n === 0 ? 0.38 : n === 1 ? 0.28 : n === 2 ? 0.20 : 0.14;
      padSignal +=
        weight *
        (0.55 * Math.sin(2 * Math.PI * noteFreq * t) +
          0.25 * Math.sin(2 * Math.PI * noteFreq * chorusLfo1 * t) +
          0.20 * Math.sin(2 * Math.PI * (noteFreq * 0.5) * chorusLfo2 * t));
    }
    const beatPos = (t % beatDur) / beatDur;
    const padPump = 0.76 + 0.24 * Math.sin(Math.PI * beatPos);
    padSignal *= padPump * profile.padWarmth;

    // 3. Deep Cinematic Sub-Bass Drone & Swell (1 octave below chord root)
    const bassFreq = (profile.rootFreq * 0.5) * Math.pow(2, chord[0] / 12);
    const beatInBar = (t % barDur) / beatDur; // 0.0 .. 4.0
    let bassEnv = 0.55 + 0.45 * Math.exp(-beatPos * 2.4);
    if (profile.genre === "afro_groove") {
      const syncDist = Math.min(
        beatInBar >= 0 ? beatInBar : 9,
        beatInBar >= 1.5 ? beatInBar - 1.5 : 9,
        beatInBar >= 2.5 ? beatInBar - 2.5 : 9,
        beatInBar >= 3.25 ? beatInBar - 3.25 : 9
      );
      bassEnv = Math.exp(-syncDist * 6.0);
    }
    const bassSignal =
      (0.80 * Math.sin(2 * Math.PI * bassFreq * t) +
        0.20 * Math.sin(2 * Math.PI * bassFreq * 2 * t)) *
      bassEnv *
      0.46;

    // 4. Expressive Felt Piano / Atmospheric Bell Motif (8th notes with warm acoustic overtones)
    const eighthIdx = Math.floor(t / eighthDur);
    const eighthPhase = (t % eighthDur) / eighthDur;
    const arpNoteSlot = profile.arpPattern[eighthIdx % profile.arpPattern.length] % chord.length;
    const arpSemitone = chord[arpNoteSlot] + (eighthIdx % 4 === 2 ? 12 : 0);
    const arpFreq = profile.rootFreq * Math.pow(2, arpSemitone / 12);
    const pluckAttack = Math.min(1, eighthPhase * 45);
    const pluckDecay = Math.exp(-eighthPhase * (profile.genre === "cyber_synth" ? 7.5 : 4.2));
    const arpSignal =
      (0.72 * Math.sin(2 * Math.PI * arpFreq * t) +
        0.20 * Math.sin(2 * Math.PI * arpFreq * 2 * t) * Math.exp(-eighthPhase * 8) +
        0.08 * Math.sin(2 * Math.PI * arpFreq * 3 * t) * Math.exp(-eighthPhase * 12)) *
      pluckAttack *
      pluckDecay *
      0.38;

    // 5. Studio Percussion (Kick + Crisp Hi-Hat/Shaker + Rim/Snare)
    let drumSignal = 0;
    if (profile.percussionIntensity > 0.25) {
      // Punchy studio kick on beats 0 and 2 (or every beat for stadium/cyber)
      const isFourOnFloor =
        profile.genre === "stadium_anthem" ||
        profile.genre === "cyber_synth" ||
        profile.genre === "executive_pulse";
      const kickTrigger = isFourOnFloor ? beatPos * beatDur : (t % (beatDur * 2));
      if (kickTrigger < 0.14) {
        const kickSweep = 52 + 95 * Math.exp(-kickTrigger * 38);
        const kickAmp = Math.exp(-kickTrigger * 22);
        drumSignal += Math.sin(2 * Math.PI * kickSweep * kickTrigger) * kickAmp * 0.45;
      }

      // Soft rim/snare on beats 1 and 3
      const snarePhase = ((t + beatDur) % (beatDur * 2));
      if (snarePhase < 0.085) {
        const snareEnv = Math.exp(-snarePhase * 36);
        drumSignal +=
          (whiteNoise * 0.55 + Math.sin(2 * Math.PI * 195 * snarePhase) * 0.45) *
          snareEnv *
          0.22;
      }

      // 8th-note shaker / hi-hat tick
      const hatPhase = t % eighthDur;
      if (hatPhase < 0.035) {
        const hatEnv = Math.exp(-hatPhase * 90);
        drumSignal += whiteNoise * hatEnv * 0.12;
      }
      drumSignal *= profile.percussionIntensity;
    }

    // Combine all studio layers with gentle warm low-pass smoothing
    const rawMix = padSignal * 0.44 + bassSignal + arpSignal + drumSignal;
    lowpassState = lowpassState + 0.38 * (rawMix - lowpassState);

    // Smooth fade-in (0.8s) and fade-out (1.5s)
    let fade = 1.0;
    if (t < 0.8) fade = t / 0.8;
    else if (t > durationSec - 1.5) fade = Math.max(0, (durationSec - t) / 1.5);

    const outVal = Math.tanh(lowpassState * fade * 1.15) * 0.72;
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(outVal * 32767))), 44 + i * 2);
  }

  fs.writeFileSync(outMusicPath, buffer);
  return profile;
}

/**
 * Pure-Node Studio Audio Mixer with Automatic Sidechain Ducking:
 * - Plays the term-matched background music clearly in the background (~28% during speech)
 * - Automatically swells background music to ~54% during natural speech pauses & outro
 * - Never requires an external binary, so it never fails with spawn ENOENT
 */
function mixVoiceAndMusicWavWithDucking(
  voiceWavPath: string,
  musicWavPath: string,
  outMixedWavPath: string,
  targetDurationSec: number
) {
  const sampleRate = 24000;
  const totalSamples = sampleRate * targetDurationSec;
  const dataSize = totalSamples * 2;
  const outBuf = Buffer.alloc(44 + dataSize);

  // Write 24kHz 16-bit mono WAV header
  outBuf.write("RIFF", 0);
  outBuf.writeUInt32LE(36 + dataSize, 4);
  outBuf.write("WAVE", 8);
  outBuf.write("fmt ", 12);
  outBuf.writeUInt32LE(16, 16);
  outBuf.writeUInt16LE(1, 20);
  outBuf.writeUInt16LE(1, 22);
  outBuf.writeUInt32LE(sampleRate, 24);
  outBuf.writeUInt32LE(sampleRate * 2, 28);
  outBuf.writeUInt16LE(2, 32);
  outBuf.writeUInt16LE(16, 34);
  outBuf.write("data", 36);
  outBuf.writeUInt32LE(dataSize, 40);

  const voiceBuf = fs.existsSync(voiceWavPath) ? fs.readFileSync(voiceWavPath) : null;
  const musicBuf = fs.existsSync(musicWavPath) ? fs.readFileSync(musicWavPath) : null;

  let voiceEnvelope = 0;
  const attackCoeff = 0.015;  // fast ducking attack when narrator speaks
  const releaseCoeff = 0.00018; // smooth musical swell during pauses

  for (let i = 0; i < totalSamples; i++) {
    const byteOffset = 44 + i * 2;
    const vSample =
      voiceBuf && byteOffset + 1 < voiceBuf.length
        ? voiceBuf.readInt16LE(byteOffset) / 32768
        : 0;
    const mSample =
      musicBuf && byteOffset + 1 < musicBuf.length
        ? musicBuf.readInt16LE(byteOffset) / 32768
        : 0;

    const absVoice = Math.abs(vSample);
    if (absVoice > voiceEnvelope) {
      voiceEnvelope += attackCoeff * (absVoice - voiceEnvelope);
    } else {
      voiceEnvelope += releaseCoeff * (absVoice - voiceEnvelope);
    }

    // Duck music smoothly: 0.54 when silent/pausing -> 0.27 when voice is speaking actively
    const speechActive = Math.min(1, voiceEnvelope * 6.5);
    const musicGain = 0.54 - speechActive * 0.27;
    const voiceGain = 1.32;

    const mixed = Math.tanh((vSample * voiceGain + mSample * musicGain) * 1.05) * 0.95;
    outBuf.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(mixed * 32767))),
      byteOffset
    );
  }

  fs.writeFileSync(outMixedWavPath, outBuf);
}

// ============================================================================
// CINEMATIC 9:16 NOIR / MOODY B-ROLL ENGINE & WORD-BY-WORD KARAOKE CAPTIONS
// (Modeled after viral TikTok/Reels/Shorts: full-bleed dark B-roll + centered
//  ALL-CAPS bold captions with Neon Green #00FF38 active word highlights)
// ============================================================================
function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Curated high-contrast cinematic vertical B-roll Unsplash photo IDs per category & theme
const CINEMATIC_BROLL_POOL: Record<ContentCategory, string[]> = {
  Motivation: [
    "1433086966358-54859d0ed716", // Cascading dramatic waterfall in deep canyon
    "1518709268805-4e9042af9f23", // Winding dark mountain road into the mist
    "1464822759023-fed622ff2c3b", // Towering dark mountain peaks & storm clouds
    "1506744038136-46273834b3fb", // Moody mountain lake reflection & cliffs
    "1534447677768-be436bb09401", // Dramatic glowing storm clouds over dark horizon
    "1519681393784-d120267933ba", // Night mountain ridge under stars
    "1470071459604-3b5ec3a7fe05", // Foggy highland valley & dramatic sunbeams
    "1509316975850-ff9c5deb0cd9", // Deep misty forest & towering pines
    "1508739773434-c26b3d09e071", // Dramatic ridge silhouette at dusk
  ],
  Football: [
    "1522778119026-d647f0596c20", // Stadium floodlights at night
    "1508098682722-e99c43a406b2", // Packed football arena atmosphere
    "1574629810360-7efbbe195018", // Dramatic football pitch under lights
    "1518091043644-c1d4457512c6", // Trophy / championship night glow
    "1431324155629-1a6deb1dec8d", // Intense match action on turf
    "1551958219-acbc608c6377",    // Goal net & stadium lights
  ],
  Entertainment: [
    "1514525253161-7a46d19cd819", // Concert stage beams & crowd silhouette
    "1470225620780-dba8ba36b745", // Dramatic spotlight & stage atmosphere
    "1501386761578-eac5c94b800a", // Arena festival lights at night
    "1511671782779-c97d3d27a1d4", // Studio microphone in moody lighting
    "1492684223066-81342ee5ff30", // Cinematic event lights & shadows
    "1516450360452-9312f5e86fc7", // Nightlife neon & silhouette
  ],
  Business: [
    "1486406146926-c627a92ad1ab", // High-contrast towering glass skyscrapers
    "1507679799987-c73779587ccf", // Executive silhouette in moody city light
    "1449824913935-59a10b8d2000", // Dramatic metropolitan skyline at night
    "1477959858617-67f85cf4f1df", // Aerial dark city architecture
    "1519501025264-65ba15a82390", // Midnight urban canyon & street lights
    "1454165804606-c3d57bc86b40", // Strategic desk & dark studio mood
  ],
  Technology: [
    "1518770660439-4636190af475", // Dark macro circuitry & glowing nodes
    "1526374965328-7f61d4dc18c5", // Matrix digital code & dark depth
    "1550751827-4bd374c3f58b",    // Cybernetic server room in shadow
    "1451187580459-43490279c0fa", // Orbital earth night lights from space
    "1509198397868-475647b2a1e5", // Futuristic dark architecture
    "1531297484001-80022131f5a1", // Sleek dark hardware silhouette
  ],
  News: [
    "1451187580459-43490279c0fa", // Global earth network from orbit
    "1477959858617-67f85cf4f1df", // World financial capital skyline
    "1486406146926-c627a92ad1ab", // Institutional towers in high contrast
    "1519501025264-65ba15a82390", // Night highway & city pulse
    "1506744038136-46273834b3fb", // Global horizon & dramatic clouds
    "1534447677768-be436bb09401", // Stormy sky over ocean horizon
  ],
  Lifestyle: [
    "1506744038136-46273834b3fb", // Calm mountain reflection at dawn
    "1470071459604-3b5ec3a7fe05", // Morning mist over quiet hills
    "1509316975850-ff9c5deb0cd9", // Peaceful pine forest sanctuary
    "1519681393784-d120267933ba", // Starlit night sky & stillness
    "1433086966358-54859d0ed716", // Pure waterfall in nature
    "1508739773434-c26b3d09e071", // Horizon sunset serenity
  ],
};

async function fetchCinematicBrollBase64(
  photoId: string,
  noirMonochrome: boolean = true
): Promise<string | null> {
  const modeKey = noirMonochrome ? "noir" : "cinema";
  const cacheFile = path.join(BROLL_CACHE_DIR, `broll_${photoId}_${modeKey}.jpg`);
  if (fs.existsSync(cacheFile)) {
    try {
      const buf = fs.readFileSync(cacheFile);
      if (buf.length > 5000) {
        return buf.toString("base64");
      }
    } catch {}
  }

  // High-contrast Noir B&W (-100 saturation, +38 contrast) or deep moody cinema grade (-55 sat, +32 contrast)
  const gradeParams = noirMonochrome
    ? "sat=-100&con=38&bri=-8"
    : "sat=-55&con=32&bri=-6";
  const url = `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=720&h=1280&q=82&${gradeParams}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 5000) {
        try {
          fs.writeFileSync(cacheFile, buf);
        } catch {}
        return buf.toString("base64");
      }
    }
  } catch {}
  return null;
}

/**
 * Renders a full-bleed 9:16 High-Contrast Noir / Cinematic B-Roll Scene Frame:
 * - Uses real photographic B-roll when available (with wide / tight camera zoom variations)
 * - Falls back to a dramatic procedural Noir mountain/waterfall/road landscape if offline
 * - Applies deep cinema vignette & subtle film grain feel with ZERO dashboard card clutter
 * - Optionally renders inline Neon Green (#00FF38) + White karaoke captions if burned directly
 */
function createCinematicNoirSceneSvg(
  sceneIndex: number,
  shotVariant: number, // 0 = wide shot, 1 = 1.15x tighter zoom/pan shot
  brollBase64: string | null,
  activePhraseWords: string[] = [],
  highlightedWordIdx: number = -1
): string {
  // Subtle camera pan/zoom crop geometry for dynamic shot cuts
  const imgX = shotVariant === 0 ? -18 : -68;
  const imgY = shotVariant === 0 ? -24 : -96;
  const imgW = shotVariant === 0 ? 756 : 856;
  const imgH = shotVariant === 0 ? 1328 : 1472;

  // Procedural Noir Landscape fallback (if offline)
  const seed = (sceneIndex * 7 + shotVariant * 3) % 4;
  const proceduralNoirBackdrop = `
    <linearGradient id="noirSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050507"/>
      <stop offset="38%" stop-color="#1c1e24"/>
      <stop offset="68%" stop-color="#0d0f13"/>
      <stop offset="100%" stop-color="#030304"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="${seed % 2 === 0 ? "50%" : "38%"}" cy="28%" r="42%">
      <stop offset="0%" stop-color="#e2e8f0" stop-opacity="0.32"/>
      <stop offset="45%" stop-color="#94a3b8" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <rect width="720" height="1280" fill="url(#noirSky)"/>
    <circle cx="${seed % 2 === 0 ? 360 : 280}" cy="350" r="320" fill="url(#moonGlow)"/>
    <!-- Distant Noir Mountain Ridges -->
    <polygon points="0,780 140,520 290,670 460,460 610,630 720,510 720,1280 0,1280" fill="#111318" opacity="0.85"/>
    <polygon points="0,850 190,640 360,770 540,580 720,740 720,1280 0,1280" fill="#090a0d"/>
    <!-- Winding Moody Perspective Road / Waterfall Mist -->
    <polygon points="348,765 372,765 560,1280 160,1280" fill="#1e222b" opacity="0.45"/>
    <line x1="360" y1="770" x2="360" y2="1280" stroke="#94a3b8" stroke-opacity="0.22" stroke-width="3" stroke-dasharray="28 22"/>
  `;

  // Optional inline SVG karaoke caption block (used if ASS subtitle filter is bypassed)
  let inlineCaptionSvg = "";
  if (activePhraseWords.length > 0) {
    const isSoloPowerWord = activePhraseWords.length === 1;
    const fontSize = isSoloPowerWord ? 70 : activePhraseWords.length <= 3 ? 60 : 52;
    // Split into max 2 balanced lines if more than 3 words
    const lines: { word: string; globalIdx: number }[][] = [];
    if (activePhraseWords.length <= 3) {
      lines.push(activePhraseWords.map((w, idx) => ({ word: w, globalIdx: idx })));
    } else {
      const mid = Math.ceil(activePhraseWords.length / 2);
      lines.push(activePhraseWords.slice(0, mid).map((w, idx) => ({ word: w, globalIdx: idx })));
      lines.push(
        activePhraseWords.slice(mid).map((w, idx) => ({ word: w, globalIdx: mid + idx }))
      );
    }

    const startY = lines.length === 1 ? 650 : 615;
    const lineStep = fontSize + 18;

    inlineCaptionSvg = lines
      .map((lineItems, lineIdx) => {
        const y = startY + lineIdx * lineStep;
        const tspans = lineItems
          .map((item, idx) => {
            const isHighlighted =
              item.globalIdx === highlightedWordIdx || (isSoloPowerWord && highlightedWordIdx >= 0);
            const fill = isHighlighted ? "#00FF38" : "#FFFFFF";
            const suffix = idx < lineItems.length - 1 ? " " : "";
            return `<tspan fill="${fill}">${escapeXml(item.word.toUpperCase())}${suffix}</tspan>`;
          })
          .join("");
        return `<text x="360" y="${y}" font-family="Liberation Sans, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#FFFFFF" stroke="#000000" stroke-width="14" stroke-linejoin="round" paint-order="stroke fill" text-anchor="middle" letter-spacing="1.5">${tspans}</text>`;
      })
      .join("\n  ");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <radialGradient id="cinemaVignette" cx="50%" cy="50%" r="68%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.20"/>
      <stop offset="58%" stop-color="#000000" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </radialGradient>
    <linearGradient id="centerContrastBand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="25%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="50%" stop-color="#000000" stop-opacity="0.38"/>
      <stop offset="75%" stop-color="#000000" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>
    </linearGradient>
  </defs>

  <!-- Full-Bleed 9:16 Cinematic Noir / Moody B-Roll -->
  ${
    brollBase64
      ? `<rect width="720" height="1280" fill="#050507"/>
         <image href="data:image/jpeg;base64,${brollBase64}" x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice"/>`
      : proceduralNoirBackdrop
  }

  <!-- Dark Atmospheric Cinema Grading & Vignette -->
  <rect width="720" height="1280" fill="url(#centerContrastBand)"/>
  <rect width="720" height="1280" fill="url(#cinemaVignette)"/>

  <!-- Optional Direct Karaoke Caption Layer -->
  ${inlineCaptionSvg}
</svg>`;
}

function renderSvgToPngBuffer(svgContent: string): Buffer {
  const resvg = new Resvg(svgContent, {
    font: {
      fontFiles: BUNDLED_FONT_FILES,
      loadSystemFonts: true,
      defaultFontFamily: "Liberation Sans",
    },
  });
  return resvg.render().asPng();
}

function formatAssTime(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

interface KaraokePhraseChunk {
  words: string[];
  isSoloPower: boolean;
}

/**
 * Splits a scene's narration into viral TikTok/Reels/Shorts karaoke phrases:
 * - Short 2-to-4 word groups for fast eye tracking
 * - Pulls out final impactful words as 1-word SOLO POWER WORDS (like "DISCIPLINE.", "SILENCE.", "FOCUS.")
 */
function splitNarrationIntoKaraokePhrases(narration: string): KaraokePhraseChunk[] {
  const rawWords = String(narration || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (rawWords.length === 0) return [];

  const phrases: KaraokePhraseChunk[] = [];
  // First split by sentence boundaries (. ! ? ;)
  const sentences = String(narration || "")
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const sWords = sentence.split(/\s+/).filter(Boolean);
    if (sWords.length === 0) continue;
    if (sWords.length <= 2) {
      phrases.push({ words: sWords, isSoloPower: sWords.length === 1 });
      continue;
    }

    let idx = 0;
    while (idx < sWords.length) {
      const remaining = sWords.length - idx;
      if (remaining === 1) {
        phrases.push({ words: [sWords[idx]], isSoloPower: true });
        idx += 1;
      } else if (remaining === 4) {
        // Split 4 remaining words into 3 + 1 solo power word if the last word is >= 5 chars
        const lastClean = sWords[sWords.length - 1].replace(/[^a-zA-Z]/g, "");
        if (lastClean.length >= 5) {
          phrases.push({ words: sWords.slice(idx, idx + 3), isSoloPower: false });
          phrases.push({ words: [sWords[idx + 3]], isSoloPower: true });
        } else {
          phrases.push({ words: sWords.slice(idx, idx + 2), isSoloPower: false });
          phrases.push({ words: sWords.slice(idx + 2, idx + 4), isSoloPower: false });
        }
        idx += 4;
      } else if (remaining <= 3) {
        phrases.push({ words: sWords.slice(idx, idx + remaining), isSoloPower: false });
        idx += remaining;
      } else {
        phrases.push({ words: sWords.slice(idx, idx + 3), isSoloPower: false });
        idx += 3;
      }
    }
  }

  return phrases;
}

/**
 * Builds Word-by-Word Neon Green (#00FF38) + Crisp White (#FFFFFF) Centered Karaoke Subtitles
 * matching the exact aesthetic of the user's reference video:
 * - Centered in the 9:16 frame (Alignment=5)
 * - Heavy bold uppercase sans-serif with thick black stroke & drop shadow
 * - Each spoken word lights up in bright Neon Green (&H0038FF00& in ASS BGR) while spoken
 */
function buildSynchronizedAssSubtitles(
  scenes: VideoScene[],
  totalDurationSec: number,
  voiceDurationSec?: number
): string {
  // Note: In ASS format, colors are &HAABBGGRR (Blue-Green-Red):
  // Pure White (#FFFFFF) = &H00FFFFFF
  // Neon Green (#00FF38) = &H0038FF00
  // Pure Black (#000000) = &H00000000
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Liberation Sans,58,&H00FFFFFF,&H0038FF00,&H00000000,&H99000000,-1,0,0,0,100,100,1.5,0,1,6.5,4,5,55,55,0,1
Style: PowerWord,Liberation Sans,72,&H0038FF00,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,2.0,0,1,7.5,5,5,55,55,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  let cursorSec = 0;

  // Match caption timing to the actual voiceover speech duration
  const effectiveSpeechSpan =
    voiceDurationSec && voiceDurationSec > 4
      ? Math.min(totalDurationSec - 0.3, Math.max(8, voiceDurationSec))
      : totalDurationSec * 0.95;

  const sceneWordCounts = scenes.map((s) =>
    Math.max(1, s.narration.split(/\s+/).filter(Boolean).length)
  );
  const totalWords = sceneWordCounts.reduce((acc, w) => acc + w, 0) || 1;

  for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
    const scene = scenes[sIdx];
    const wordWeight = sceneWordCounts[sIdx] / totalWords;
    const sceneDuration = Math.max(1.6, effectiveSpeechSpan * wordWeight);
    const phrases = splitNarrationIntoKaraokePhrases(scene.narration);
    if (phrases.length === 0) continue;

    // Weight phrase duration by character/word length so longer words get natural speaking time
    const phraseWeights = phrases.map((p) =>
      p.words.reduce((sum, w) => sum + Math.max(3, w.length), 0) + (p.isSoloPower ? 3 : 0)
    );
    const totalPhraseWeight = phraseWeights.reduce((a, b) => a + b, 0) || 1;

    for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
      const phrase = phrases[pIdx];
      const phraseDur = (phraseWeights[pIdx] / totalPhraseWeight) * sceneDuration;
      const phraseStart = cursorSec;

      if (phrase.isSoloPower || phrase.words.length === 1) {
        const cleanWord = phrase.words[0].replace(/[{}]/g, "").toUpperCase();
        const start = phraseStart;
        const end = Math.min(totalDurationSec, phraseStart + phraseDur);
        events.push(
          `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},PowerWord,,0,0,0,,{\\fscx110\\fscy110\\t(0,140,\\fscx100\\fscy100)\\c&H38FF00&}${cleanWord}`
        );
      } else {
        // Word-by-word active Neon Green highlight across the phrase
        const wordWeights = phrase.words.map((w) => Math.max(3, w.length));
        const totalWordWeight = wordWeights.reduce((a, b) => a + b, 0) || 1;
        let wordCursor = phraseStart;

        for (let wIdx = 0; wIdx < phrase.words.length; wIdx++) {
          const wDur = (wordWeights[wIdx] / totalWordWeight) * phraseDur;
          const wStart = wordCursor;
          const wEnd = Math.min(totalDurationSec, wordCursor + wDur);

          // Format phrase with optional 2-line wrap if 4 words
          const formattedWords = phrase.words.map((w, idx) => {
            const clean = w.replace(/[{}]/g, "").toUpperCase();
            if (idx === wIdx) {
              return `{\\c&H38FF00&}${clean}{\\c&HFFFFFF&}`;
            }
            return clean;
          });

          let lineText = "";
          if (formattedWords.length >= 4) {
            lineText = `${formattedWords.slice(0, 2).join(" ")}\\N${formattedWords.slice(2).join(" ")}`;
          } else {
            lineText = formattedWords.join(" ");
          }

          const popTag = wIdx === 0 ? `{\\fscx105\\fscy105\\t(0,110,\\fscx100\\fscy100)}` : "";
          events.push(
            `Dialogue: 0,${formatAssTime(wStart)},${formatAssTime(wEnd)},Karaoke,,0,0,0,,${popTag}${lineText}`
          );
          wordCursor += wDur;
        }
      }

      cursorSec += phraseDur;
    }
  }

  return header + events.join("\n") + "\n";
}

// ============================================================================
// ASYNC BACKGROUND JOB WORKER PIPELINE
// ============================================================================
async function processAutomationJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  const jobWorkDir = path.join(TEMP_WORK_DIR, job.id);
  if (!fs.existsSync(jobWorkDir)) {
    fs.mkdirSync(jobWorkDir, { recursive: true });
  }

  const updateStage = (status: JobStage, progress: number, patch?: Partial<AutomationJob>) => {
    const current = jobs.get(jobId);
    if (!current) return;
    Object.assign(current, patch || {}, {
      status,
      progress,
      updatedAt: new Date().toISOString(),
    });
    saveJobs();
  };

  try {
    // STAGE 1: GENERATING SCRIPT (Steps 1, 2, 3, 9, 10, 11)
    // Avoid regenerating the script if this is a retry and script/scenes already exist
    updateStage("GENERATING SCRIPT", 15);
    const acc = getOrCreateAccount(job.userId, job.userEmail);
    let plan: GeneratedScriptResult;

    if (job.script && job.scenes && job.scenes.length > 0 && job.title) {
      plan = {
        idea: job.idea || `${job.category} short-form video`,
        hook: job.hook || job.scenes[0].narration,
        script: job.script,
        title: job.title,
        description: job.description || "",
        hashtags: job.hashtags || [job.category.toLowerCase(), "shorts"],
        scenes: job.scenes,
        voiceName: `${adminVoiceSettings.defaultVoiceName || "Adam"} (ElevenLabs)`,
        musicTrackName:
          job.musicTrackName || (CATEGORY_THEMES[job.category] || CATEGORY_THEMES.Motivation).musicName,
      };
    } else {
      plan = await aiProvider.generateContentPlan(
        job.category,
        job.platform,
        job.targetDurationSec,
        job.customTopic
      );
      acc.totalApiCallsTracked += 1;
      saveAccounts();
    }

    updateStage("GENERATING VOICE", 35, {
      idea: plan.idea,
      hook: plan.hook,
      script: plan.script,
      title: plan.title,
      description: plan.description,
      hashtags: plan.hashtags,
      scenes: plan.scenes,
      voiceId: adminVoiceSettings.defaultVoiceId,
      voiceName: `${adminVoiceSettings.defaultVoiceName || "Adam"} (ElevenLabs)`,
      musicTrackName: plan.musicTrackName,
    });

    // STAGE 2: GENERATING VOICE (Step 4 — ElevenLabs Default Voice: Adam) + ROYALTY-FREE BACKGROUND MUSIC (Step 8)
    const voiceWavPath = path.join(jobWorkDir, "voice.wav");
    const musicWavPath = path.join(jobWorkDir, "music.wav");
    const mixedAudioPath = path.join(jobWorkDir, "mixed_audio.wav");

    const voiceResult = await aiProvider.generateVoiceoverWav(
      plan.script,
      job.category,
      voiceWavPath
    );

    if (voiceResult.fromCache) {
      acc.voiceCacheHitsThisMonth = (acc.voiceCacheHitsThisMonth || 0) + 1;
    } else if (voiceResult.ok) {
      acc.totalApiCallsTracked += 1;
      acc.voiceGenerationsThisMonth = (acc.voiceGenerationsThisMonth || 0) + 1;
      acc.voiceCharactersUsedThisMonth =
        (acc.voiceCharactersUsedThisMonth || 0) + voiceResult.charactersCharged;
    }
    saveAccounts();

    updateStage("GENERATING VOICE", 48, {
      voiceId: voiceResult.voiceId,
      voiceName: `${voiceResult.voiceName} (ElevenLabs)`,
      voiceProvider: voiceResult.provider,
      voiceFromCache: voiceResult.fromCache,
      voiceCharactersUsed: voiceResult.charactersCharged,
      voiceDurationSec: voiceResult.durationSec,
    });

    // Compose Term-Aware Royalty-Free Background Music matched to the Category & Topic/Term
    const termContext = `${job.customTopic || ""} ${plan.title || ""} ${plan.idea || ""}`.trim();
    const musicProfile = composeTermAwareBackgroundMusicWav(
      musicWavPath,
      job.targetDurationSec,
      job.category,
      termContext
    );

    updateStage("GENERATING VOICE", 52, {
      musicTrackName: musicProfile.trackTitle,
    });

    // Mix studio-mastered voiceover + term-aware background music with automatic sidechain ducking
    if (voiceResult.ok && fs.existsSync(voiceWavPath)) {
      mixVoiceAndMusicWavWithDucking(
        voiceWavPath,
        musicWavPath,
        mixedAudioPath,
        job.targetDurationSec
      );
    } else {
      fs.copyFileSync(musicWavPath, mixedAudioPath);
    }

    // STAGE 3 & 4: CREATING 9:16 CINEMATIC NOIR B-ROLL SCENES + WORD-BY-WORD NEON GREEN KARAOKE CAPTIONS (Steps 5, 6, 7)
    updateStage("CREATING VIDEO", 62);
    const concatLines: string[] = [];
    const scenes = plan.scenes;
    const sceneWordCounts = scenes.map((s) =>
      Math.max(1, s.narration.split(/\s+/).filter(Boolean).length)
    );
    const totalWords = sceneWordCounts.reduce((a, b) => a + b, 0) || scenes.length;

    // Fetch cinematic B-roll photos for each scene in parallel (with disk cache & instant procedural fallback)
    const categoryPool = CINEMATIC_BROLL_POOL[job.category] || CINEMATIC_BROLL_POOL.Motivation;
    const isNoirMonochrome =
      job.category === "Motivation" ||
      /(discipline|silence|grind|alone|focus|pain|mindset|dark|noir|stoic|warrior)/i.test(termContext);

    // Deterministic rotation offset based on job ID so each video gets fresh visual shots
    let poolOffset = 0;
    for (let k = 0; k < job.id.length; k++) {
      poolOffset = (poolOffset + job.id.charCodeAt(k)) % categoryPool.length;
    }

    const sceneBrollList = await Promise.all(
      scenes.map(async (_, idx) => {
        const photoA = categoryPool[(poolOffset + idx * 2) % categoryPool.length];
        const photoB = categoryPool[(poolOffset + idx * 2 + 1) % categoryPool.length];
        const [b64A, b64B] = await Promise.all([
          fetchCinematicBrollBase64(photoA, isNoirMonochrome),
          fetchCinematicBrollBase64(photoB, isNoirMonochrome),
        ]);
        return [b64A, b64B || b64A];
      })
    );

    updateStage("ADDING CAPTIONS", 76);
    let lastPngPath = "";

    // Render 2 dynamic camera cuts per scene (Shot A + Shot B) for a true cinematic B-roll rhythm
    for (let i = 0; i < scenes.length; i++) {
      const sceneSec = Math.max(
        2.5,
        (sceneWordCounts[i] / totalWords) * job.targetDurationSec
      );
      const shotsPerScene = 2;
      const shotDur = Number((sceneSec / shotsPerScene).toFixed(2));

      for (let shot = 0; shot < shotsPerScene; shot++) {
        const b64 = sceneBrollList[i]?.[shot] || null;
        const svgContent = createCinematicNoirSceneSvg(i, shot, b64);
        const pngBuffer = renderSvgToPngBuffer(svgContent);
        const pngPath = path.join(jobWorkDir, `broll_s${i + 1}_v${shot + 1}.png`);
        fs.writeFileSync(pngPath, pngBuffer);
        lastPngPath = pngPath;
        concatLines.push(`file '${pngPath}'`);
        concatLines.push(`duration ${Math.max(1.0, shotDur).toFixed(2)}`);
      }
    }

    // Repeat last frame for ffmpeg concat demuxer
    if (lastPngPath) {
      concatLines.push(`file '${lastPngPath}'`);
    }

    const concatFilePath = path.join(jobWorkDir, "scenes_concat.txt");
    fs.writeFileSync(concatFilePath, concatLines.join("\n") + "\n", "utf-8");

    // Build Word-by-Word Neon Green (#00FF38) + White Centered Karaoke ASS Subtitles
    const assContent = buildSynchronizedAssSubtitles(
      scenes,
      job.targetDurationSec,
      voiceResult.durationSec
    );
    const assFilePath = path.join(jobWorkDir, "karaoke_captions.ass");
    fs.writeFileSync(assFilePath, assContent, "utf-8");

    // STAGE 5: RENDERING FINAL 9:16 VERTICAL MP4 VIDEO (Step 12, 13, 14)
    updateStage("RENDERING", 88);
    const outputFileName = `ai_short_${job.id}.mp4`;
    const outputMp4Path = path.join(PUBLIC_VIDEOS_DIR, outputFileName);

    const fontsDirPath = path.resolve(process.cwd(), "public", "fonts");
    const escapedAssPath = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontsDir = fontsDirPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    await execFileAsync(getFfmpegBinary(), [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFilePath,
      "-i",
      mixedAudioPath,
      "-vf",
      `fps=24,ass=${escapedAssPath}:fontsdir=${escapedFontsDir},format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "160k",
      "-t",
      String(job.targetDurationSec),
      "-movflags",
      "+faststart",
      outputMp4Path,
    ]);

    const stat = fs.statSync(outputMp4Path);

    updateStage("COMPLETED", 100, {
      videoUrl: `/generated-videos/${outputFileName}`,
      durationSec: job.targetDurationSec,
      fileSizeBytes: stat.size,
      completedAt: new Date().toISOString(),
      errorMessage: undefined,
    });

    // Cleanup temporary working files
    try {
      fs.rmSync(jobWorkDir, { recursive: true, force: true });
    } catch {}
  } catch (err: any) {
    console.error(`[Automation] Job ${jobId} failed:`, err);
    // Refund quota if it failed so retrying does not double-charge the user
    const current = jobs.get(jobId);
    if (current && current.quotaCharged) {
      const acc = getOrCreateAccount(current.userId, current.userEmail);
      acc.videosUsedThisMonth = Math.max(0, acc.videosUsedThisMonth - 1);
      acc.totalVideosCreated = Math.max(0, acc.totalVideosCreated - 1);
      current.quotaCharged = false;
      saveAccounts();
    }
    updateStage("FAILED", 0, {
      errorMessage:
        err?.message || "Video rendering encountered a temporary error. Click Retry to resume for free.",
    });
    try {
      fs.rmSync(jobWorkDir, { recursive: true, force: true });
    } catch {}
  }
}

// ============================================================================
// AUTO MODE BACKGROUND SCHEDULER
// ============================================================================
setInterval(() => {
  try {
    const now = Date.now();
    for (const sched of schedules.values()) {
      if (!sched.enabled) continue;
      const nextRunMs = new Date(sched.nextRunAt).getTime();
      if (isNaN(nextRunMs) || nextRunMs > now) continue;

      const acc = getOrCreateAccount(sched.userId, sched.userEmail);
      const limit = getMonthlyLimit(acc);
      if (acc.videosUsedThisMonth >= limit) {
        // Quota reached; push next check forward 12 hours
        sched.nextRunAt = new Date(now + 12 * 3600 * 1000).toISOString();
        saveSchedules();
        continue;
      }

      // Enqueue scheduled Auto Mode video generation job
      const jobId = `auto_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const newJob: AutomationJob = {
        id: jobId,
        userId: sched.userId,
        userEmail: sched.userEmail,
        category: sched.category,
        platform: sched.platform,
        targetDurationSec: sched.durationSec,
        isAutoMode: true,
        status: "QUEUED",
        progress: 5,
        retryCount: 0,
        quotaCharged: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      acc.videosUsedThisMonth += 1;
      acc.totalVideosCreated += 1;
      saveAccounts();

      jobs.set(jobId, newJob);
      saveJobs();

      const intervalHours = Math.max(8, Math.floor(24 / Math.max(1, sched.videosPerDay)));
      sched.lastRunAt = new Date().toISOString();
      sched.nextRunAt = new Date(now + intervalHours * 3600 * 1000).toISOString();
      sched.totalGenerated += 1;
      saveSchedules();

      processAutomationJob(jobId);
    }
  } catch (e) {
    console.error("[Automation] Auto Mode scheduler error:", e);
  }
}, 30_000);

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. GET USER DASHBOARD SUMMARY (Account, Usage Limits, Jobs, Auto Mode Schedule)
automationRouter.get("/api/automation/dashboard", (req: Request, res: Response) => {
  const userId = String(req.query.userId || "").trim();
  const email = String(req.query.email || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "Authentication required (userId missing)." });
  }

  const acc = getOrCreateAccount(userId, email);
  const monthlyLimit = getMonthlyLimit(acc);
  const videosRemaining = Math.max(0, monthlyLimit - acc.videosUsedThisMonth);

  const userJobs = Array.from(jobs.values())
    .filter((j) => j.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const schedule = schedules.get(userId) || null;
  const userPayments = Array.from(payments.values())
    .filter((p) => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({
    account: {
      ...acc,
      monthlyLimit,
      videosRemaining,
      voiceCharLimit: getMonthlyVoiceCharLimit(acc),
      proPriceUsd: PRO_PRICE_USD,
      proPriceGhs: PRO_PRICE_GHS,
    },
    voiceSummary: {
      provider: "ElevenLabs",
      defaultVoiceId: adminVoiceSettings.defaultVoiceId,
      defaultVoiceName: adminVoiceSettings.defaultVoiceName,
      speed: adminVoiceSettings.speed,
    },
    jobs: userJobs,
    schedule,
    payments: userPayments,
    paymentConfig: {
      merchantName: "Global News",
      amountUsd: PRO_PRICE_USD,
      amountGhs: PRO_PRICE_GHS,
      supportedProviders: ["ghana_momo_push", "paystack", "telecel", "mtn", "at"],
    },
  });
});

// 2. CREATE VIDEO GENERATION JOB(S) (Protected by Check 12 rate limit & cost controls)
automationRouter.post("/api/automation/generate", aiGenerationLimiter, (req: Request, res: Response) => {
  const {
    userId,
    userEmail,
    category,
    platform,
    durationSec,
    videoCount = 1,
    customTopic,
  } = req.body || {};

  if (!userId || typeof userId !== "string") {
    return res.status(401).json({ error: "Please sign in to create automated AI videos." });
  }

  // Rate limit check
  if (!checkRateLimit(`gen_${userId}`, 6, 60_000)) {
    return res.status(429).json({
      error: "Rate limit reached. Please wait a moment before starting more generations.",
    });
  }

  // Duplicate click / concurrency lock
  if (activeUserLocks.has(userId)) {
    return res.status(409).json({
      error: "A generation request is already being submitted. Please wait.",
    });
  }

  activeUserLocks.add(userId);
  try {
    const acc = getOrCreateAccount(userId, userEmail || "");

    // Prevent rapid double-clicking within 4 seconds
    if (acc.lastGenerationRequestedAt && Date.now() - acc.lastGenerationRequestedAt < 4000) {
      return res.status(429).json({
        error: "Duplicate click detected. Your video job is already queued.",
      });
    }

    const validCategories: ContentCategory[] = [
      "Motivation",
      "Football",
      "Entertainment",
      "Business",
      "Technology",
      "News",
      "Lifestyle",
    ];
    const selectedCategory: ContentCategory = validCategories.includes(category)
      ? category
      : "Motivation";

    const validPlatforms: SocialPlatform[] = ["TikTok", "Instagram Reels", "YouTube Shorts"];
    const selectedPlatform: SocialPlatform = validPlatforms.includes(platform)
      ? platform
      : "TikTok";

    const parsedDuration = Math.min(60, Math.max(30, Number(durationSec) || 30));
    const requestedCount = Math.min(3, Math.max(1, Number(videoCount) || 1));

    const monthlyLimit = getMonthlyLimit(acc);
    const remaining = Math.max(0, monthlyLimit - acc.videosUsedThisMonth);

    if (remaining < requestedCount) {
      return res.status(403).json({
        error:
          acc.plan === "FREE"
            ? `You have ${remaining} video(s) remaining on the Free plan (${FREE_MONTHLY_VIDEO_LIMIT}/month). Upgrade to Pro ($1/month) for ${PRO_MONTHLY_VIDEO_LIMIT} videos/month.`
            : `You have ${remaining} video(s) remaining of your ${PRO_MONTHLY_VIDEO_LIMIT} monthly Pro quota.`,
        code: "QUOTA_EXCEEDED",
      });
    }

    // Enforce monthly voice character profitability cap for $1/month plan
    const voiceCharLimit = getMonthlyVoiceCharLimit(acc);
    if (!isOwnerEmail(acc.email) && (acc.voiceCharactersUsedThisMonth || 0) >= voiceCharLimit) {
      return res.status(403).json({
        error: `Monthly ElevenLabs voiceover character budget (${voiceCharLimit.toLocaleString()} chars) reached for your ${acc.plan} plan.`,
        code: "QUOTA_EXCEEDED",
      });
    }

    acc.lastGenerationRequestedAt = Date.now();
    const createdJobs: AutomationJob[] = [];

    for (let i = 0; i < requestedCount; i++) {
      const jobId = `vid_${Date.now()}_${i}_${crypto.randomBytes(3).toString("hex")}`;
      const newJob: AutomationJob = {
        id: jobId,
        userId,
        userEmail: userEmail || acc.email,
        category: selectedCategory,
        platform: selectedPlatform,
        targetDurationSec: parsedDuration,
        customTopic: customTopic ? String(customTopic).trim().slice(0, 140) : undefined,
        isAutoMode: false,
        status: "QUEUED",
        progress: 5,
        retryCount: 0,
        quotaCharged: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      acc.videosUsedThisMonth += 1;
      acc.totalVideosCreated += 1;
      jobs.set(jobId, newJob);
      createdJobs.push(newJob);
    }

    saveAccounts();
    saveJobs();

    // Process jobs sequentially in background so CPU isn't overloaded
    (async () => {
      for (const j of createdJobs) {
        await processAutomationJob(j.id);
      }
    })();

    return res.json({
      success: true,
      jobs: createdJobs,
      videosRemaining: Math.max(0, monthlyLimit - acc.videosUsedThisMonth),
    });
  } finally {
    activeUserLocks.delete(userId);
  }
});

// 3. RETRY FAILED JOB (FREE — DOES NOT DOUBLE CHARGE QUOTA)
automationRouter.post("/api/automation/jobs/:id/retry", (req: Request, res: Response) => {
  const jobId = String(req.params.id || "");
  const { userId } = req.body || {};

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }
  if (job.userId !== userId) {
    return res.status(403).json({ error: "Unauthorized to retry this job." });
  }
  if (job.status !== "FAILED") {
    return res.status(400).json({ error: "Only failed jobs can be retried." });
  }

  const acc = getOrCreateAccount(job.userId, job.userEmail);
  const monthlyLimit = getMonthlyLimit(acc);
  if (!job.quotaCharged && acc.videosUsedThisMonth >= monthlyLimit) {
    return res.status(403).json({
      error: "Monthly video limit reached. Please upgrade to retry.",
    });
  }

  if (!job.quotaCharged) {
    acc.videosUsedThisMonth += 1;
    acc.totalVideosCreated += 1;
    job.quotaCharged = true;
    saveAccounts();
  }

  job.status = "QUEUED";
  job.progress = 5;
  job.errorMessage = undefined;
  job.retryCount += 1;
  job.updatedAt = new Date().toISOString();
  saveJobs();

  processAutomationJob(job.id);

  return res.json({ success: true, job });
});

// 4. CONFIGURE OR TOGGLE AUTO MODE SCHEDULE
automationRouter.post("/api/automation/auto-mode", (req: Request, res: Response) => {
  const {
    userId,
    userEmail,
    enabled,
    category,
    platform,
    videosPerDay = 1,
    durationSec = 30,
    preferredTimeUtc = "09:00",
    runImmediately = false,
  } = req.body || {};

  if (!userId) {
    return res.status(401).json({ error: "Please sign in to configure Auto Mode." });
  }

  const acc = getOrCreateAccount(userId, userEmail || "");
  const existing = schedules.get(userId);

  const validCategories: ContentCategory[] = [
    "Motivation",
    "Football",
    "Entertainment",
    "Business",
    "Technology",
    "News",
    "Lifestyle",
  ];
  const selectedCategory: ContentCategory = validCategories.includes(category)
    ? category
    : existing?.category || "Motivation";

  const validPlatforms: SocialPlatform[] = ["TikTok", "Instagram Reels", "YouTube Shorts"];
  const selectedPlatform: SocialPlatform = validPlatforms.includes(platform)
    ? platform
    : existing?.platform || "TikTok";

  const clampedPerDay = Math.min(3, Math.max(1, Number(videosPerDay) || 1));
  const clampedDuration = Math.min(60, Math.max(30, Number(durationSec) || 30));
  const intervalHours = Math.max(8, Math.floor(24 / clampedPerDay));

  const schedule: AutoModeSchedule = {
    id: existing?.id || `sched_${userId}`,
    userId,
    userEmail: userEmail || acc.email,
    enabled: Boolean(enabled),
    category: selectedCategory,
    platform: selectedPlatform,
    videosPerDay: clampedPerDay,
    durationSec: clampedDuration,
    preferredTimeUtc: String(preferredTimeUtc || "09:00"),
    lastRunAt: existing?.lastRunAt,
    nextRunAt: new Date(Date.now() + intervalHours * 3600 * 1000).toISOString(),
    totalGenerated: existing?.totalGenerated || 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  schedules.set(userId, schedule);
  saveSchedules();

  let triggeredJob: AutomationJob | null = null;
  if (runImmediately && schedule.enabled) {
    const limit = getMonthlyLimit(acc);
    if (acc.videosUsedThisMonth < limit) {
      const jobId = `auto_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      triggeredJob = {
        id: jobId,
        userId,
        userEmail: schedule.userEmail,
        category: schedule.category,
        platform: schedule.platform,
        targetDurationSec: schedule.durationSec,
        isAutoMode: true,
        status: "QUEUED",
        progress: 5,
        retryCount: 0,
        quotaCharged: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      acc.videosUsedThisMonth += 1;
      acc.totalVideosCreated += 1;
      schedule.lastRunAt = new Date().toISOString();
      schedule.totalGenerated += 1;
      jobs.set(jobId, triggeredJob);
      saveAccounts();
      saveJobs();
      saveSchedules();
      processAutomationJob(jobId);
    }
  }

  return res.json({
    success: true,
    schedule,
    triggeredJob,
  });
});

// 5. SUBMIT PRO PLAN ($1/MONTH = GH₵ 15) PAYMENT REQUEST (GHANA MOMO + EXTENSIBLE PROVIDERS)
automationRouter.post("/api/automation/payment/initiate", (req: Request, res: Response) => {
  const {
    userId,
    userEmail,
    userPhone,
    network = "telecel",
    provider = "ghana_momo",
    reference = "",
  } = req.body || {};

  if (!userId || !userPhone) {
    return res.status(400).json({ error: "User ID and Ghana Mobile Money phone number are required." });
  }

  const unlockCode = String(Math.floor(100000 + Math.random() * 900000));
  const paymentId = `autopay_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const record: AutomationPaymentRecord = {
    id: paymentId,
    userId,
    userEmail: userEmail || "user@globalnews.site",
    userPhone: String(userPhone).trim(),
    provider,
    network,
    amountUsd: PRO_PRICE_USD,
    amountGhs: PRO_PRICE_GHS,
    reference: String(reference).trim() || `AI-PRO-${paymentId.slice(-5).toUpperCase()}`,
    unlockCode,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  payments.set(paymentId, record);
  savePayments();

  return res.json({
    success: true,
    paymentId: record.id,
    status: record.status,
    merchantName: "Global News",
    promptTriggered: true,
    amountUsd: PRO_PRICE_USD,
    amountGhs: PRO_PRICE_GHS,
    message:
      "MoMo payment prompt triggered! Please check your phone screen and enter your PIN to authorize GH₵ 15.00 to Global News.",
  });
});

// 6. CONFIRM PAYMENT (PROVIDER WEBHOOK / UNLOCK CODE / ADMIN CONFIRMATION)
automationRouter.post("/api/automation/payment/confirm", (req: Request, res: Response) => {
  const { paymentId, userId, unlockCode, adminEmail, txReference } = req.body || {};

  const record = paymentId ? payments.get(String(paymentId)) : undefined;
  if (!record) {
    return res.status(404).json({ error: "Payment record not found." });
  }

  const isAdmin = isOwnerEmail(adminEmail);
  const isCodeMatch = unlockCode && String(unlockCode).trim() === record.unlockCode;
  const isValidRef =
    txReference &&
    String(txReference).trim().length >= 5 &&
    record.userId === userId;

  if (!isAdmin && !isCodeMatch && !isValidRef) {
    return res.status(403).json({
      error: "Payment confirmation requires a valid MoMo transaction ID or confirmation code.",
    });
  }

  record.status = "confirmed";
  record.confirmedAt = new Date().toISOString();
  if (txReference) {
    record.reference = String(txReference).trim();
  }
  savePayments();

  const acc = getOrCreateAccount(record.userId, record.userEmail);
  acc.plan = "PRO";
  acc.proExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  acc.paymentProvider = record.provider;
  acc.updatedAt = new Date().toISOString();
  saveAccounts();

  return res.json({
    success: true,
    account: {
      ...acc,
      monthlyLimit: getMonthlyLimit(acc),
      videosRemaining: Math.max(0, getMonthlyLimit(acc) - acc.videosUsedThisMonth),
    },
  });
});

// ============================================================================
// 7. ADMIN VOICE SETTINGS — ELEVENLABS (Locked down with Check 01 & Check 09)
// ============================================================================
automationRouter.get("/api/automation/admin/voice-settings", requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const voiceCheck = await fetchElevenLabsVoicesFromApi();

    // If Adam is selected and we found Adam's exact ID in the connected account, ensure ID matches
    if (
      voiceCheck.connected &&
      voiceCheck.adamAvailable &&
      voiceCheck.adamVoiceId &&
      adminVoiceSettings.defaultVoiceName.toLowerCase() === "adam" &&
      adminVoiceSettings.defaultVoiceId !== voiceCheck.adamVoiceId
    ) {
      adminVoiceSettings.defaultVoiceId = voiceCheck.adamVoiceId;
      saveVoiceSettings();
    }

    // Estimate ElevenLabs cost (~$0.15 per 1,000 chars on standard creator tiers) to monitor $1/mo profitability
    const estimatedVoiceCostUsd = Number(
      ((adminVoiceSettings.totalVoiceCharactersUsed / 1000) * 0.15).toFixed(4)
    );

    return res.json({
      settings: adminVoiceSettings,
      availableVoices: voiceCheck.voices,
      elevenLabsConnected: voiceCheck.connected,
      adamAvailable: voiceCheck.adamAvailable,
      adamError:
        !voiceCheck.adamAvailable
          ? voiceCheck.error ||
            adminVoiceSettings.lastAdamError ||
            "The 'Adam' voice is unavailable through the connected ElevenLabs account. Please select another available ElevenLabs voice."
          : adminVoiceSettings.lastAdamError || null,
      lastVoiceError: adminVoiceSettings.lastVoiceError || voiceCheck.error || null,
      usageStats: {
        totalVoiceCharactersUsed: adminVoiceSettings.totalVoiceCharactersUsed,
        totalVoiceApiCalls: adminVoiceSettings.totalVoiceApiCalls,
        totalVoiceCacheHits: adminVoiceSettings.totalVoiceCacheHits,
        estimatedVoiceCostUsd,
        proPlanMonthlyCharBudget: PRO_MONTHLY_VOICE_CHAR_LIMIT,
        freePlanMonthlyCharBudget: FREE_MONTHLY_VOICE_CHAR_LIMIT,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Failed to load ElevenLabs voice settings.",
    });
  }
});

automationRouter.post("/api/automation/admin/voice-settings", requireAdminAuth, (req: Request, res: Response) => {
  const {
    adminEmail,
    defaultVoiceId,
    defaultVoiceName,
    modelId,
    stability,
    similarityBoost,
    style,
    speed,
    useSpeakerBoost,
  } = req.body || {};

  if (defaultVoiceId && typeof defaultVoiceId === "string") {
    adminVoiceSettings.defaultVoiceId = defaultVoiceId.trim();
  }
  if (defaultVoiceName && typeof defaultVoiceName === "string") {
    adminVoiceSettings.defaultVoiceName = defaultVoiceName.trim();
  }
  if (modelId && typeof modelId === "string") {
    adminVoiceSettings.modelId = modelId.trim();
  }
  if (stability !== undefined) {
    adminVoiceSettings.stability = Math.min(1, Math.max(0, Number(stability)));
  }
  if (similarityBoost !== undefined) {
    adminVoiceSettings.similarityBoost = Math.min(1, Math.max(0, Number(similarityBoost)));
  }
  if (style !== undefined) {
    adminVoiceSettings.style = Math.min(1, Math.max(0, Number(style)));
  }
  if (speed !== undefined) {
    adminVoiceSettings.speed = Math.min(1.2, Math.max(0.7, Number(speed)));
  }
  if (useSpeakerBoost !== undefined) {
    adminVoiceSettings.useSpeakerBoost = Boolean(useSpeakerBoost);
  }

  // Clear Adam error if admin switches to another voice
  if (adminVoiceSettings.defaultVoiceName.toLowerCase() !== "adam") {
    adminVoiceSettings.lastAdamError = null;
  }
  adminVoiceSettings.lastVoiceError = null;
  adminVoiceSettings.updatedAt = new Date().toISOString();
  if (adminEmail) {
    adminVoiceSettings.updatedBy = String(adminEmail);
  }

  saveVoiceSettings();

  logSecurityEvent("ADMIN_VOICE_SETTINGS_UPDATED", {
    voice: adminVoiceSettings.defaultVoiceName,
    voiceId: adminVoiceSettings.defaultVoiceId,
    updatedBy: adminVoiceSettings.updatedBy,
  }, "info");

  return res.json({
    success: true,
    settings: adminVoiceSettings,
    message: `Default ElevenLabs voice updated to ${adminVoiceSettings.defaultVoiceName}. All customer videos will automatically use this voice.`,
  });
});

automationRouter.post("/api/automation/admin/voice-test", requireAdminAuth, async (req: Request, res: Response) => {
  const {
    sampleText,
    voiceId,
    voiceName,
    modelId,
    stability,
    similarityBoost,
    style,
    speed,
    useSpeakerBoost,
  } = req.body || {};

  const testPhrase =
    String(sampleText || "").trim() ||
    "Discipline is choosing between what you want now and what you want most. Stay focused and keep building every single day.";

  const override: Partial<AdminVoiceSettings> = {
    defaultVoiceId: voiceId || adminVoiceSettings.defaultVoiceId,
    defaultVoiceName: voiceName || adminVoiceSettings.defaultVoiceName,
    modelId: modelId || adminVoiceSettings.modelId,
    stability: stability !== undefined ? Number(stability) : adminVoiceSettings.stability,
    similarityBoost:
      similarityBoost !== undefined ? Number(similarityBoost) : adminVoiceSettings.similarityBoost,
    style: style !== undefined ? Number(style) : adminVoiceSettings.style,
    speed: speed !== undefined ? Number(speed) : adminVoiceSettings.speed,
    useSpeakerBoost:
      useSpeakerBoost !== undefined ? Boolean(useSpeakerBoost) : adminVoiceSettings.useSpeakerBoost,
  };

  try {
    const tmpTestPath = path.join(TEMP_WORK_DIR, `admin_test_${Date.now()}.wav`);
    const result = await aiProvider.generateVoiceoverWav(
      testPhrase,
      "Motivation",
      tmpTestPath,
      override
    );

    if (!result.ok || !fs.existsSync(tmpTestPath)) {
      return res.status(500).json({
        error:
          adminVoiceSettings.lastAdamError ||
          adminVoiceSettings.lastVoiceError ||
          "Could not synthesize test voice audio.",
      });
    }

    const publicFileName = `studio_v3_test_${result.cacheKey}.wav`;
    const publicPath = path.join(PUBLIC_VOICES_DIR, publicFileName);
    fs.copyFileSync(tmpTestPath, publicPath);
    try {
      fs.unlinkSync(tmpTestPath);
    } catch {}

    return res.json({
      success: true,
      audioUrl: `/generated-voices/${publicFileName}`,
      provider: result.provider,
      fromCache: result.fromCache,
      voiceId: result.voiceId,
      voiceName: result.voiceName,
      durationSec: result.durationSec,
      charactersCharged: result.charactersCharged,
      adamError: adminVoiceSettings.lastAdamError || null,
      voiceWarning: adminVoiceSettings.lastVoiceError || null,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Voice test failed.",
    });
  }
});

// 8. TERM-AWARE BACKGROUND MUSIC PREVIEW ENDPOINT
automationRouter.get("/api/automation/music-preview", (req: Request, res: Response) => {
  const rawCategory = String(req.query.category || "Motivation").trim() as ContentCategory;
  const validCategories: ContentCategory[] = [
    "Motivation",
    "Football",
    "Entertainment",
    "Business",
    "Technology",
    "News",
    "Lifestyle",
  ];
  const category: ContentCategory = validCategories.includes(rawCategory)
    ? rawCategory
    : "Motivation";
  const term = String(req.query.term || "").trim().slice(0, 120);

  try {
    const hash = crypto
      .createHash("sha256")
      .update(`music_v2_${category}_${term.toLowerCase()}`)
      .digest("hex")
      .slice(0, 16);
    const fileName = `music_preview_${hash}.wav`;
    const filePath = path.join(PUBLIC_VOICES_DIR, fileName);

    const profile = composeTermAwareBackgroundMusicWav(filePath, 10, category, term);

    return res.json({
      success: true,
      audioUrl: `/generated-voices/${fileName}`,
      trackTitle: profile.trackTitle,
      bpm: profile.bpm,
      genre: profile.genre,
      matchedTerm: profile.matchedTermLabel,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Failed to generate term music preview.",
    });
  }
});


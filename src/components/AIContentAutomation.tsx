import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Video,
  Play,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Zap,
  Copy,
  Check,
  X,
  Volume2,
  Music,
  FileText,
  Hash,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Loader2,
  Sliders,
  ArrowRight,
  RotateCcw,
  Printer,
} from 'lucide-react';

import { User } from 'firebase/auth';
import axios from 'axios';
import {
  isGhanaLocaleOrTimezone,
  isGhanaPhoneNumber,
  getCachedPlatformStatus,
  shouldShowSubscriptions,
} from '../utils/geo';
import { isAdminUser } from '../utils/subscription';
import AdminVoiceSettingsPanel from './AdminVoiceSettingsPanel';

export type ContentCategory =
  | 'Motivation'
  | 'Football'
  | 'Entertainment'
  | 'Business'
  | 'Technology'
  | 'News'
  | 'Lifestyle';

export type SocialPlatform = 'TikTok' | 'Instagram Reels' | 'YouTube Shorts';

export type JobStage =
  | 'QUEUED'
  | 'GENERATING SCRIPT'
  | 'GENERATING VOICE'
  | 'CREATING VIDEO'
  | 'ADDING CAPTIONS'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED';

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
  targetDurationSec: number;
  customTopic?: string;
  isAutoMode: boolean;
  status: JobStage;
  progress: number;
  errorMessage?: string;
  retryCount: number;
  idea?: string;
  hook?: string;
  script?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  scenes?: VideoScene[];
  voiceName?: string;
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
  videosPerDay: number;
  durationSec: number;
  preferredTimeUtc: string;
  lastRunAt?: string;
  nextRunAt: string;
  totalGenerated: number;
}

export interface AutomationAccount {
  userId: string;
  email: string;
  plan: 'FREE' | 'PRO';
  proExpiresAt?: number;
  currentMonthKey: string;
  videosUsedThisMonth: number;
  monthlyLimit: number;
  videosRemaining: number;
  totalVideosCreated: number;
  totalApiCallsTracked: number;
  proPriceUsd: number;
  proPriceGhs: number;
}

interface AIContentAutomationProps {
  user: User | null;
  onOpenAuth: () => void;
}

const CATEGORIES: { id: ContentCategory; label: string; tagline: string }[] = [
  { id: 'Motivation', label: 'Motivation', tagline: 'Discipline, mindset & daily drive' },
  { id: 'Football', label: 'Football', tagline: 'Tactics, match stories & records' },
  { id: 'Entertainment', label: 'Entertainment', tagline: 'Cinema, music & pop culture' },
  { id: 'Business', label: 'Business', tagline: 'Cash-flow, startups & strategy' },
  { id: 'Technology', label: 'Technology', tagline: 'AI tools, gadgets & future tech' },
  { id: 'News', label: 'News', tagline: '60-second global & regional briefings' },
  { id: 'Lifestyle', label: 'Lifestyle', tagline: 'Habits, wellness & productivity' },
];

const PLATFORMS: { id: SocialPlatform; label: string; ratio: string }[] = [
  { id: 'TikTok', label: 'TikTok', ratio: '9:16 Vertical' },
  { id: 'Instagram Reels', label: 'Instagram Reels', ratio: '9:16 Vertical' },
  { id: 'YouTube Shorts', label: 'YouTube Shorts', ratio: '9:16 Vertical' },
];

const JOB_PIPELINE_STAGES: JobStage[] = [
  'QUEUED',
  'GENERATING SCRIPT',
  'GENERATING VOICE',
  'CREATING VIDEO',
  'ADDING CAPTIONS',
  'RENDERING',
  'COMPLETED',
];

export default function AIContentAutomation({ user, onOpenAuth }: AIContentAutomationProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'automode' | 'admin_voice'>('create');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'completed' | 'scheduled' | 'failed'>('all');
  const [defaultVoiceName, setDefaultVoiceName] = useState<string>('Adam');

  // Creation Form State
  const [selectedCategory, setSelectedCategory] = useState<ContentCategory>('Motivation');
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform>('TikTok');
  const [durationSec, setDurationSec] = useState<number>(30);
  const [videoCount, setVideoCount] = useState<number>(1);
  const [customTopic, setCustomTopic] = useState<string>('');

  // Auto Mode Form State
  const [autoEnabled, setAutoEnabled] = useState<boolean>(false);
  const [autoCategory, setAutoCategory] = useState<ContentCategory>('Motivation');
  const [autoPlatform, setAutoPlatform] = useState<SocialPlatform>('TikTok');
  const [autoVideosPerDay, setAutoVideosPerDay] = useState<number>(1);
  const [autoDurationSec, setAutoDurationSec] = useState<number>(30);
  const [autoTime, setAutoTime] = useState<string>('09:00');
  const [isSavingAuto, setIsSavingAuto] = useState<boolean>(false);

  // Backend State
  const [account, setAccount] = useState<AutomationAccount | null>(null);
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [schedule, setSchedule] = useState<AutoModeSchedule | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preview Modal State
  const [previewJob, setPreviewJob] = useState<AutomationJob | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Term-Aware Background Music Preview State
  const [musicPreviewUrl, setMusicPreviewUrl] = useState<string | null>(null);
  const [musicPreviewTitle, setMusicPreviewTitle] = useState<string>('');
  const [isLoadingMusicPreview, setIsLoadingMusicPreview] = useState<boolean>(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Payment Modal State (Ghana MoMo + International Architecture)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentProvider, setPaymentProvider] = useState<'ghana_momo' | 'paystack'>('ghana_momo');
  const [momoNetwork, setMomoNetwork] = useState<'mtn' | 'telecel' | 'at'>('telecel');
  const [momoPhone, setMomoPhone] = useState<string>('');
  const [momoReference, setMomoReference] = useState<string>('');
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [confirmationInput, setConfirmationInput] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  const pollTimerRef = useRef<any>(null);

  const effectiveUserId = user?.uid || '';
  const effectiveEmail = user?.email || '';
  const platformStatus = getCachedPlatformStatus();
  const isGhanaUser =
    platformStatus.isGhana ||
    isGhanaLocaleOrTimezone() ||
    isGhanaPhoneNumber(momoPhone) ||
    isAdminUser(user);
  const showPaymentsForRegion = false; // All payments removed from site

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!effectiveUserId) return;
      if (!silent) setIsLoadingDashboard(true);
      try {
        const res = await axios.get(
          `/api/automation/dashboard?userId=${encodeURIComponent(effectiveUserId)}&email=${encodeURIComponent(effectiveEmail)}`
        );
        if (res.data) {
          setAccount(res.data.account);
          setJobs(res.data.jobs || []);
          if (res.data.schedule) {
            setSchedule(res.data.schedule);
            setAutoEnabled(Boolean(res.data.schedule.enabled));
            setAutoCategory(res.data.schedule.category);
            setAutoPlatform(res.data.schedule.platform);
            setAutoVideosPerDay(res.data.schedule.videosPerDay);
            setAutoDurationSec(res.data.schedule.durationSec);
            setAutoTime(res.data.schedule.preferredTimeUtc || '09:00');
          }
          if (res.data.paymentConfig) {
            setPaymentConfig(res.data.paymentConfig);
          }
          if (res.data.voiceSummary?.defaultVoiceName) {
            setDefaultVoiceName(res.data.voiceSummary.defaultVoiceName);
          }
        }
      } catch (err) {
        console.error('Failed to fetch automation dashboard:', err);
      } finally {
        if (!silent) setIsLoadingDashboard(false);
      }
    },
    [effectiveUserId, effectiveEmail]
  );

  useEffect(() => {
    if (effectiveUserId) {
      fetchDashboard(false);
    }
  }, [effectiveUserId, fetchDashboard]);

  // Poll every 2.5s whenever there is an active job running
  useEffect(() => {
    const hasActiveJob = jobs.some(
      (j) => j.status !== 'COMPLETED' && j.status !== 'FAILED'
    );
    if (hasActiveJob && effectiveUserId) {
      pollTimerRef.current = setInterval(() => {
        fetchDashboard(true);
      }, 2500);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [jobs, effectiveUserId, fetchDashboard]);

  const handleCreateMyVideo = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (isSubmittingJob) return;

    setFeedbackBanner(null);
    setIsSubmittingJob(true);

    try {
      const res = await axios.post('/api/automation/generate', {
        userId: user.uid,
        userEmail: user.email,
        category: selectedCategory,
        platform: selectedPlatform,
        durationSec,
        videoCount,
        customTopic: customTopic.trim() || undefined,
      });

      if (res.data?.success) {
        setCustomTopic('');
        setFeedbackBanner({
          type: 'success',
          text: `Queued ${res.data.jobs?.length || 1} vertical 9:16 video(s) for ${selectedPlatform}. Watch the live pipeline below!`,
        });
        await fetchDashboard(true);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        'Unable to start video generation right now. Please try again.';
      setFeedbackBanner({ type: 'error', text: msg });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!user || retryingJobId) return;
    setRetryingJobId(jobId);
    setFeedbackBanner(null);
    try {
      await axios.post(`/api/automation/jobs/${jobId}/retry`, {
        userId: user.uid,
      });
      setFeedbackBanner({
        type: 'success',
        text: 'Job restarted without deducting from your monthly video limit.',
      });
      await fetchDashboard(true);
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Failed to retry job.',
      });
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleSaveAutoMode = async (runImmediately = false) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setIsSavingAuto(true);
    setFeedbackBanner(null);
    try {
      const res = await axios.post('/api/automation/auto-mode', {
        userId: user.uid,
        userEmail: user.email,
        enabled: runImmediately ? true : autoEnabled,
        category: autoCategory,
        platform: autoPlatform,
        videosPerDay: autoVideosPerDay,
        durationSec: autoDurationSec,
        preferredTimeUtc: autoTime,
        runImmediately,
      });

      if (res.data?.success) {
        setSchedule(res.data.schedule);
        setAutoEnabled(res.data.schedule.enabled);
        setFeedbackBanner({
          type: 'success',
          text: runImmediately
            ? `Auto Mode activated for ${autoCategory} (${autoVideosPerDay}/day) and first scheduled video queued!`
            : `Auto Mode schedule saved (${autoCategory} · ${autoVideosPerDay} video/day · ${autoDurationSec}s).`,
        });
        await fetchDashboard(true);
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Could not save Auto Mode schedule.',
      });
    } finally {
      setIsSavingAuto(false);
    }
  };

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!momoPhone.trim()) {
      setFeedbackBanner({ type: 'error', text: 'Please enter your Ghana Mobile Money number.' });
      return;
    }
    setIsProcessingPayment(true);
    try {
      const res = await axios.post('/api/automation/payment/initiate', {
        userId: user.uid,
        userEmail: user.email,
        userPhone: momoPhone.trim(),
        network: momoNetwork,
        provider: paymentProvider,
        reference: momoReference.trim(),
      });
      if (res.data?.success) {
        setPendingPaymentId(res.data.paymentId);
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Could not initiate payment.',
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pendingPaymentId) return;
    if (!confirmationInput.trim() || confirmationInput.trim().length < 5) {
      setFeedbackBanner({
        type: 'error',
        text: 'Please enter your MoMo Transaction ID (at least 5 characters) or confirmation code.',
      });
      return;
    }
    setIsProcessingPayment(true);
    try {
      const res = await axios.post('/api/automation/payment/confirm', {
        paymentId: pendingPaymentId,
        userId: user.uid,
        adminEmail: user.email,
        txReference: confirmationInput.trim(),
        unlockCode: confirmationInput.trim(),
      });
      if (res.data?.success) {
        setAccount(res.data.account);
        setIsPaymentModalOpen(false);
        setPendingPaymentId(null);
        setConfirmationInput('');
        setFeedbackBanner({
          type: 'success',
          text: 'Pro Plan ($1/month · 20 videos/month) confirmed and activated!',
        });
        await fetchDashboard(true);
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Payment confirmation failed.',
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCopyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getActiveMusicPreviewLabel = (cat: ContentCategory, term: string): string => {
    const lower = `${cat} ${term}`.toLowerCase();
    const shortTerm = term.trim() ? term.trim().slice(0, 24) : cat;
    if (/(pray|faith|god|church|peace|calm|meditat|heal|sleep|grace|spirit)/i.test(lower)) {
      return `Celestial Reflective Piano & Strings · Tuned for "${shortTerm}" (82 BPM)`;
    }
    if (/(goal|match|champion|stadium|football|soccer|premier|fifa|world cup|striker|tactic)/i.test(lower)) {
      return `Stadium Victory Pulse · Tuned for "${shortTerm}" (126 BPM)`;
    }
    if (/(afro|ghana|accra|lagos|dance|music|concert|party|vibe|celebrity|movie)/i.test(lower)) {
      return `Accra-to-Global Afro Groove · Tuned for "${shortTerm}" (110 BPM)`;
    }
    if (/(money|wealth|invest|crypto|bitcoin|profit|sales|startup|million|ceo|rich|cash)/i.test(lower)) {
      return `Wall Street & Founder Momentum · Tuned for "${shortTerm}" (114 BPM)`;
    }
    if (/(ai|robot|future|cyber|code|software|quantum|space|gadget|digital)/i.test(lower)) {
      return `Neural Future Synthwave · Tuned for "${shortTerm}" (120 BPM)`;
    }
    if (/(breaking|alert|urgent|crisis|market|election|summit|report|headline)/i.test(lower)) {
      return `Breaking Newsroom Pulse · Tuned for "${shortTerm}" (122 BPM)`;
    }
    if (/(gym|workout|grind|hustle|beast|warrior|win|power|unstoppable|discipline)/i.test(lower)) {
      return `Unstoppable Discipline Anthem · Tuned for "${shortTerm}" (106 BPM)`;
    }
    const defaults: Record<ContentCategory, string> = {
      Motivation: `Epic Horizon Rise · Tuned for "${shortTerm}" (98 BPM)`,
      Football: `Stadium Pulse Anthem · Tuned for "${shortTerm}" (124 BPM)`,
      Entertainment: `Afro-Neon Spotlight Groove · Tuned for "${shortTerm}" (108 BPM)`,
      Business: `Executive Momentum · Tuned for "${shortTerm}" (112 BPM)`,
      Technology: `Cybernetic Horizon Synth · Tuned for "${shortTerm}" (118 BPM)`,
      News: `Global Broadcast Headline Bed · Tuned for "${shortTerm}" (120 BPM)`,
      Lifestyle: `Golden Hour Lo-Fi Breeze · Tuned for "${shortTerm}" (88 BPM)`,
    };
    return defaults[cat] || defaults.Motivation;
  };

  const handlePreviewTermMusic = async () => {
    if (isLoadingMusicPreview) return;
    setIsLoadingMusicPreview(true);
    try {
      const res = await axios.get(
        `/api/automation/music-preview?category=${encodeURIComponent(selectedCategory)}&term=${encodeURIComponent(customTopic.trim())}`
      );
      if (res.data?.audioUrl) {
        const url = `${res.data.audioUrl}?t=${Date.now()}`;
        setMusicPreviewUrl(url);
        setMusicPreviewTitle(res.data.trackTitle || getActiveMusicPreviewLabel(selectedCategory, customTopic));
        setTimeout(() => {
          if (musicAudioRef.current) {
            musicAudioRef.current.load();
            musicAudioRef.current.play().catch(() => {});
          }
        }, 60);
      }
    } catch (err) {
      console.error('Failed to preview background music:', err);
    } finally {
      setIsLoadingMusicPreview(false);
    }
  };

  const handleDownloadVideo = (job: AutomationJob) => {
    if (!job.videoUrl) return;
    const cleanTitle = (job.title || job.category)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const link = document.createElement('a');
    link.href = job.videoUrl;
    link.download = `${cleanTitle}_9x16.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Computed Stats for Dashboard
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED');
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');
  const scheduledAutoJobs = jobs.filter((j) => j.isAutoMode);
  const activeRunningJobs = jobs.filter(
    (j) => j.status !== 'COMPLETED' && j.status !== 'FAILED'
  );

  const filteredJobs = jobs.filter((j) => {
    if (libraryFilter === 'completed') return j.status === 'COMPLETED';
    if (libraryFilter === 'failed') return j.status === 'FAILED';
    if (libraryFilter === 'scheduled') return j.isAutoMode;
    return true;
  });

  const currentPlan = account?.plan || 'FREE';
  const videosRemaining = account ? account.videosRemaining : 3;
  const monthlyLimit = account ? account.monthlyLimit : 3;
  const videosCreatedThisMonth = account ? account.videosUsedThisMonth : completedJobs.length;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/10 pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-400">
            <span>GlobalNews Studio</span>
            <span aria-hidden="true">·</span>
            <span>Automated 9:16 Short-Form Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            AI Content Automation
          </h1>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl">
            Automatically generate viral ideas, scroll-stopping hooks, AI voiceovers, synchronized captions, royalty-free music, and rendered 9:16 vertical videos for TikTok, Reels &amp; YouTube Shorts.
          </p>
        </div>

        {/* Primary Mode Navigation */}
        <div className="flex items-center gap-1.5 p-1.5 bg-[#141821] border border-white/10 rounded-xl self-start lg:self-auto">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'create'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Create My Video</span>
          </button>
          <button
            onClick={() => setActiveTab('automode')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'automode'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Auto Mode</span>
          </button>

          {isAdminUser(user) && (
            <button
              onClick={() => setActiveTab('admin_voice')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'admin_voice'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Admin Voice Settings</span>
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'promo' }))}
            className="px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 border border-yellow-500/20"
            title="Create and print physical promotional flyers"
          >
            <Printer className="w-4 h-4 text-yellow-400" />
            <span>Physical Flyer Studio</span>
          </button>
        </div>
      </div>


      {/* Sign-In Prompt if Guest */}
      {!user && (
        <div className="bg-[#121722] border border-blue-500/30 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              Sign in to save &amp; automate your vertical videos
            </h2>
            <p className="text-sm text-gray-400">
              Your generated videos, monthly usage quota, and Auto Mode schedules are securely tied to your GlobalNews account.
            </p>
          </div>
          <button
            onClick={onOpenAuth}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0"
          >
            Sign In / Create Account
          </button>
        </div>
      )}

      {/* Status Notification Banner */}
      {feedbackBanner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/40 border-red-500/30 text-red-200'
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-medium">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-gray-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User Dashboard Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#12161f] border border-white/10 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-gray-400 font-medium">Videos Created</span>
          <div className="text-2xl font-black text-white font-mono">
            {completedJobs.length}
          </div>
          <p className="text-xs text-gray-500">
            {failedJobs.length} failed · {activeRunningJobs.length} active
          </p>
        </div>

        <div className="bg-[#12161f] border border-white/10 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-gray-400 font-medium">Remaining This Month</span>
          <div className="text-2xl font-black text-blue-400 font-mono">
            {videosRemaining} <span className="text-sm text-gray-500 font-normal">/ {monthlyLimit}</span>
          </div>
          <p className="text-xs text-gray-500">
            {videosCreatedThisMonth} used this month
          </p>
        </div>

        <div className="bg-[#12161f] border border-white/10 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-gray-400 font-medium">Current Plan</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-black text-emerald-400">
              FREE CREATOR
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Full Access &bull; 100% Free
          </p>
        </div>

        <div className="bg-[#12161f] border border-white/10 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-gray-400 font-medium">Content Category</span>
          <div className="text-xl font-bold text-white truncate">
            {selectedCategory}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {selectedPlatform} · {durationSec}s
          </p>
        </div>

        <div className="bg-[#12161f] border border-white/10 rounded-2xl p-4 space-y-1 col-span-2 lg:col-span-1">
          <span className="text-xs text-gray-400 font-medium">Scheduled Content</span>
          <div className="text-xl font-bold text-white flex items-center gap-2">
            <span>{schedule?.enabled ? `${schedule.videosPerDay}/day` : 'Off'}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {schedule?.enabled
              ? `Auto: ${schedule.category} (${schedule.durationSec}s)`
              : 'Enable in Auto Mode tab'}
          </p>
        </div>
      </div>

      {/* TAB 1: CREATE MY VIDEO WORKSPACE */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Creation Controls (7 cols) */}
          <div className="lg:col-span-7 bg-[#12161f] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  1-Click AI Video Generator
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Select your category, target platform, and duration—AI handles all 14 production steps automatically.
                </p>
              </div>
              <span className="text-xs text-gray-400 font-mono">9:16 HD MP4</span>
            </div>

            {/* Step 1: Select Content Category */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                1. Content Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-600/15 border-blue-500 text-white'
                          : 'bg-[#0b0e14] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-bold">{cat.label}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                        {cat.tagline}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Select Target Platform */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                2. Target Platform
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PLATFORMS.map((plat) => {
                  const isSelected = selectedPlatform === plat.id;
                  return (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => setSelectedPlatform(plat.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-blue-600/15 border-blue-500 text-white'
                          : 'bg-[#0b0e14] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-bold">{plat.label}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{plat.ratio}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Video Length (30-60s) & Number of Videos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  3. Video Length (30–60 Seconds)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDurationSec(sec)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all ${
                        durationSec === sec
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#0b0e14] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  4. Number of Videos to Create
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setVideoCount(cnt)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all ${
                        videoCount === cnt
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#0b0e14] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {cnt} {cnt === 1 ? 'Video' : 'Videos'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optional Custom Topic Override */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  Optional Specific Topic / Term
                </label>
                <span className="text-xs text-gray-500">
                  Script &amp; background music automatically match your term
                </span>
              </div>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder={`e.g. Why ${selectedCategory.toLowerCase()} winners focus on habits...`}
                maxLength={140}
                className="w-full px-4 py-3 bg-[#0b0e14] border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Term-Matched Background Music Bar */}
            <div className="p-3.5 bg-[#0b0e14] border border-white/10 rounded-xl space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Music className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Auto-Matched Background Music (Plays Under Voiceover)
                    </div>
                    <div className="text-xs font-semibold text-white truncate">
                      {musicPreviewTitle || getActiveMusicPreviewLabel(selectedCategory, customTopic)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePreviewTermMusic}
                  disabled={isLoadingMusicPreview}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  {isLoadingMusicPreview ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>Composing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-blue-400 fill-current" />
                      <span>Preview Music</span>
                    </>
                  )}
                </button>
              </div>
              {musicPreviewUrl && (
                <audio
                  ref={musicAudioRef}
                  src={musicPreviewUrl}
                  controls
                  className="w-full h-8 rounded-lg"
                />
              )}
            </div>

            {/* Primary CTA Button: "Create My Video" */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handleCreateMyVideo}
                disabled={isSubmittingJob}
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 text-white font-black text-base rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-3 cursor-pointer"
              >
                {isSubmittingJob ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting Automated Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    <span>Create My Video</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                <span>
                  Uses {videoCount} generation(s) · {videosRemaining} remaining this month
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('automode')}
                  className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Switch to Auto Mode</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live 14-Step Automation Workflow & Active Pipeline Status (5 cols) */}
          <div className="lg:col-span-5 bg-[#12161f] border border-white/10 rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-4">
                <h3 className="text-lg font-bold text-white">
                  Automated Production Pipeline
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Asynchronous background job system—never freezes your browser.
                </p>
              </div>

              {/* Active Running Job Progress Tracker */}
              {activeRunningJobs.length > 0 ? (
                <div className="space-y-4">
                  {activeRunningJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 bg-[#0b0e14] border border-blue-500/40 rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{job.status}</span>
                        </span>
                        <span className="text-xs font-mono text-white">
                          {job.progress}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${Math.max(8, job.progress)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 flex items-center justify-between">
                        <span>
                          {job.category} · {job.platform} · {job.targetDurationSec}s
                        </span>
                        <span>Background Worker</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-[#0b0e14] border border-white/10 rounded-xl text-xs text-gray-400">
                  No jobs currently rendering. Click <strong className="text-white">Create My Video</strong> to launch a new background job.
                </div>
              )}

              {/* Job Stage State Machine Checklist */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Job System Stages
                </div>
                <div className="space-y-2">
                  {JOB_PIPELINE_STAGES.map((stage, idx) => {
                    const activeJob = activeRunningJobs[0];
                    const activeIdx = activeJob
                      ? JOB_PIPELINE_STAGES.indexOf(activeJob.status)
                      : -1;
                    const isDone = activeJob ? idx < activeIdx : false;
                    const isCurrent = activeJob ? idx === activeIdx : false;

                    return (
                      <div
                        key={stage}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                          isCurrent
                            ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                            : isDone
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-[#0b0e14] border-white/5 text-gray-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[11px] text-gray-500">
                            0{idx + 1}
                          </span>
                          <span>{stage}</span>
                        </div>
                        {isCurrent && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                        {isDone && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 14-Step Included Deliverables Summary */}
            <div className="p-4 bg-[#0b0e14] rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span>Included in Every Automated Video:</span>
                <span className="text-blue-400 font-mono">
                  ElevenLabs Voice: {defaultVoiceName}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                1. Content Idea · 2. Short-Form Script · 3. 2–3s Scroll Hook · 4. ElevenLabs AI Voiceover ({defaultVoiceName}) · 5. Vertical 9:16 Visuals · 6. Voice-Synchronized Captions · 7. Royalty-Free Music · 8. Viral Title, Description &amp; Hashtags · 9. Instant MP4 Preview &amp; Download.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUTO MODE SCHEDULER */}
      {activeTab === 'automode' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-[#12161f] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Auto Mode — Hands-Free Daily Schedule
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Configure your category and daily frequency. Our server automatically generates and saves new videos on schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoEnabled(!autoEnabled)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  autoEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {autoEnabled ? 'Auto Mode: ON' : 'Auto Mode: OFF'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  Category
                </label>
                <select
                  value={autoCategory}
                  onChange={(e) => setAutoCategory(e.target.value as ContentCategory)}
                  className="w-full px-4 py-3 bg-[#0b0e14] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  Target Platform
                </label>
                <select
                  value={autoPlatform}
                  onChange={(e) => setAutoPlatform(e.target.value as SocialPlatform)}
                  className="w-full px-4 py-3 bg-[#0b0e14] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  Videos Per Day
                </label>
                <select
                  value={autoVideosPerDay}
                  onChange={(e) => setAutoVideosPerDay(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-[#0b0e14] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={1}>1 video per day</option>
                  <option value={2}>2 videos per day</option>
                  <option value={3}>3 videos per day</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                  Duration (30–60 seconds)
                </label>
                <select
                  value={autoDurationSec}
                  onChange={(e) => setAutoDurationSec(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-[#0b0e14] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSaveAutoMode(false)}
                disabled={isSavingAuto}
                className="flex-1 py-3.5 px-5 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-xl transition-colors"
              >
                {isSavingAuto ? 'Saving...' : 'Save Auto Schedule'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveAutoMode(true)}
                disabled={isSavingAuto}
                className="flex-1 py-3.5 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>Enable &amp; Run 1st Video Now</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#12161f] border border-white/10 rounded-2xl p-6 space-y-5">
            <h3 className="text-lg font-bold text-white border-b border-white/10 pb-3">
              Current Auto Mode Summary
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">Status</span>
                <span className="font-bold text-white">
                  {schedule?.enabled ? 'Active (Scheduled)' : 'Paused'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">Category</span>
                <span className="font-bold text-white">
                  {schedule?.category || autoCategory}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">Schedule Frequency</span>
                <span className="font-bold text-white">
                  {schedule?.videosPerDay || autoVideosPerDay} per day
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">Duration</span>
                <span className="font-bold text-white">
                  {schedule?.durationSec || autoDurationSec} seconds (30–60s)
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">Next Automated Run</span>
                <span className="font-mono text-xs text-blue-400">
                  {schedule?.enabled && schedule?.nextRunAt
                    ? new Date(schedule.nextRunAt).toLocaleString()
                    : 'Not scheduled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400">Auto-Generated Videos</span>
                <span className="font-mono font-bold text-white">
                  {schedule?.totalGenerated || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* TAB 4: ADMIN VOICE SETTINGS (ELEVENLABS — DEFAULT VOICE: ADAM) */}
      {activeTab === 'admin_voice' && isAdminUser(user) && (
        <AdminVoiceSettingsPanel
          adminEmail={user?.email || undefined}
          onSettingsUpdated={(s) => setDefaultVoiceName(s.defaultVoiceName || 'Adam')}
        />
      )}

      {/* USER DASHBOARD: COMPLETED, SCHEDULED & FAILED VIDEOS */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              Your Generated Videos &amp; Job Queue
            </h2>
            <p className="text-xs text-gray-400">
              Preview your 9:16 vertical videos, copy titles &amp; hashtags, or download the final MP4.
            </p>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#141821] border border-white/10 rounded-xl self-start">
            {(
              [
                { id: 'all', label: `All (${jobs.length})` },
                { id: 'completed', label: `Completed (${completedJobs.length})` },
                { id: 'scheduled', label: `Auto Mode (${scheduledAutoJobs.length})` },
                { id: 'failed', label: `Failed (${failedJobs.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLibraryFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  libraryFilter === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoadingDashboard ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 bg-[#12161f] border border-white/10 rounded-2xl">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
            <span className="text-sm text-gray-400">Loading your video dashboard...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-16 text-center bg-[#12161f] border border-white/10 rounded-2xl space-y-3 px-4">
            <Video className="w-10 h-10 text-gray-600 mx-auto" />
            <div className="text-base font-bold text-white">No videos in this view yet</div>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Select a category above and click <strong className="text-white">Create My Video</strong> to generate your first 9:16 vertical video with voiceover, captions, and music.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredJobs.map((job) => {
              const isCompleted = job.status === 'COMPLETED';
              const isFailed = job.status === 'FAILED';
              const isRunning = !isCompleted && !isFailed;

              return (
                <div
                  key={job.id}
                  className="bg-[#12161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all"
                >
                  <div className="space-y-3">
                    {/* Unboxed Clean Metadata Kicker */}
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-blue-400">{job.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.platform}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.targetDurationSec}s</span>
                        {job.isAutoMode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">Auto</span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-gray-500">
                        {new Date(job.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-white line-clamp-2 leading-snug">
                      {job.title || `${job.category} Short-Form Video (${job.targetDurationSec}s)`}
                    </h3>

                    {/* Hook Preview */}
                    {job.hook && (
                      <p className="text-xs text-gray-300 bg-[#0b0e14] p-3 rounded-xl border border-white/5 line-clamp-2">
                        <strong className="text-blue-400">Hook: </strong>
                        {job.hook}
                      </p>
                    )}

                    {/* Hashtags Inline Text */}
                    {job.hashtags && job.hashtags.length > 0 && (
                      <div className="text-xs text-gray-400 truncate">
                        {job.hashtags.map((h) => `#${h}`).join('  ')}
                      </div>
                    )}

                    {/* Matched Background Music Line */}
                    {job.musicTrackName && (
                      <div className="text-[11px] text-gray-400 flex items-center gap-1.5 truncate">
                        <Music className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="truncate">{job.musicTrackName}</span>
                      </div>
                    )}

                    {/* Running Progress */}
                    {isRunning && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-blue-400 font-semibold flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{job.status}</span>
                          </span>
                          <span className="font-mono text-gray-300">{job.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${Math.max(8, job.progress)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Failed Error + Free Retry */}
                    {isFailed && (
                      <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl space-y-2">
                        <div className="text-xs text-red-300">
                          {job.errorMessage || 'Generation failed.'}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingJobId === job.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>
                            {retryingJobId === job.id ? 'Retrying...' : 'Retry (Free)'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Completed Actions: Preview & Download */}
                  {isCompleted && (
                    <div className="pt-3 border-t border-white/10 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPreviewJob(job)}
                        className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadVideo(job)}
                        className="flex-1 py-2.5 px-3 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: 9:16 VERTICAL VIDEO PREVIEW & ASSETS MODAL */}
      {previewJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#12161f] border border-white/15 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-12 max-h-[92vh]">
            {/* Left: 9:16 Vertical Video Player (5 cols) */}
            <div className="md:col-span-5 bg-black flex flex-col items-center justify-center p-4 relative">
              {previewJob.videoUrl ? (
                <video
                  src={previewJob.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-w-[270px] aspect-[9/16] rounded-xl border border-white/15 bg-[#07090e] object-contain shadow-lg"
                />
              ) : (
                <div className="w-full max-w-[270px] aspect-[9/16] rounded-xl border border-white/10 flex items-center justify-center text-xs text-gray-500">
                  Video file unavailable
                </div>
              )}
              <div className="mt-3 text-[11px] text-gray-400 font-mono">
                9:16 Vertical MP4 · {previewJob.targetDurationSec}s · Voiceover + Captions + Music
              </div>
            </div>

            {/* Right: Script, Hook, Title, Description, Hashtags & Download (7 cols) */}
            <div className="md:col-span-7 p-6 flex flex-col justify-between overflow-y-auto space-y-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                  <div>
                    <div className="text-xs text-blue-400 font-semibold">
                      {previewJob.category} · {previewJob.platform}
                    </div>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {previewJob.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewJob(null)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg bg-white/5"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Hook (First 2-3 Seconds) */}
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Opening Hook (First 2–3 Seconds)
                  </div>
                  <div className="p-3 bg-[#0b0e14] border border-white/10 rounded-xl text-xs text-white">
                    {previewJob.hook}
                  </div>
                </div>

                {/* Full Narration Script */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Voiceover Script &amp; Synchronized Captions
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('script', previewJob.script || '')}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {copiedField === 'script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'script' ? 'Copied' : 'Copy Script'}</span>
                    </button>
                  </div>
                  <div className="p-3 bg-[#0b0e14] border border-white/10 rounded-xl text-xs text-gray-200 leading-relaxed max-h-32 overflow-y-auto">
                    {previewJob.script}
                  </div>
                </div>

                {/* Description & Hashtags */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Post Description &amp; Hashtags
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          'caption',
                          `${previewJob.title}\n\n${previewJob.description}\n\n${(previewJob.hashtags || [])
                            .map((h) => `#${h}`)
                            .join(' ')}`
                        )
                      }
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {copiedField === 'caption' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'caption' ? 'Copied All' : 'Copy Post Caption'}</span>
                    </button>
                  </div>
                  <div className="p-3 bg-[#0b0e14] border border-white/10 rounded-xl text-xs text-gray-300 space-y-2">
                    <p>{previewJob.description}</p>
                    <p className="text-blue-400 font-medium">
                      {(previewJob.hashtags || []).map((h) => `#${h}`).join(' ')}
                    </p>
                  </div>
                </div>

                {/* Audio Metadata */}
                <div className="text-xs text-gray-400 flex flex-wrap items-center gap-2">
                  <span>Voice: {previewJob.voiceName || 'AI Studio Voice'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Music: {previewJob.musicTrackName || 'Royalty-Free Mix'}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDownloadVideo(previewJob)}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download 9:16 Video (.MP4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewJob(null)}
                  className="py-3 px-4 bg-white/10 hover:bg-white/15 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

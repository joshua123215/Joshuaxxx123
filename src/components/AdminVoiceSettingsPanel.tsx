import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Play,
  Check,
  AlertTriangle,
  Sliders,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import axios from 'axios';

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
  provider: 'elevenlabs';
  defaultVoiceId: string;
  defaultVoiceName: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
  totalVoiceCharactersUsed: number;
  totalVoiceApiCalls: number;
  totalVoiceCacheHits: number;
  lastAdamError?: string | null;
  lastVoiceError?: string | null;
  updatedAt: string;
  updatedBy?: string;
}

interface AdminVoiceSettingsPanelProps {
  adminEmail?: string;
  onSettingsUpdated?: (settings: AdminVoiceSettings) => void;
}

export default function AdminVoiceSettingsPanel({
  adminEmail,
  onSettingsUpdated,
}: AdminVoiceSettingsPanelProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);

  const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [adamAvailable, setAdamAvailable] = useState<boolean>(true);
  const [adamError, setAdamError] = useState<string | null>(null);
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);

  // Voice Settings Form State (Default: Adam)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('pNInz6obpgDQGcFmaJgB');
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('Adam');
  const [modelId, setModelId] = useState<string>('eleven_multilingual_v2');
  const [stability, setStability] = useState<number>(0.45);
  const [similarityBoost, setSimilarityBoost] = useState<number>(0.8);
  const [style, setStyle] = useState<number>(0.35);
  const [speed, setSpeed] = useState<number>(1.05);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState<boolean>(true);

  // Usage & Profitability Stats
  const [usageStats, setUsageStats] = useState<{
    totalVoiceCharactersUsed: number;
    totalVoiceApiCalls: number;
    totalVoiceCacheHits: number;
    estimatedVoiceCostUsd: number;
    proPlanMonthlyCharBudget: number;
    freePlanMonthlyCharBudget: number;
  }>({
    totalVoiceCharactersUsed: 0,
    totalVoiceApiCalls: 0,
    totalVoiceCacheHits: 0,
    estimatedVoiceCostUsd: 0,
    proPlanMonthlyCharBudget: 14000,
    freePlanMonthlyCharBudget: 2400,
  });

  // Voice Test State
  const [sampleText, setSampleText] = useState<string>(
    'Stop scrolling! Discipline is choosing between what you want right now and what you want most. Stay focused and keep building every single day.'
  );
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [testMeta, setTestMeta] = useState<{
    voiceName: string;
    durationSec: number;
    fromCache: boolean;
  } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchVoiceSettings = async () => {
    setLoading(true);
    const activeAdmin = adminEmail || 'joshuaocansey731@gmail.com';
    try {
      const res = await axios.get('/api/automation/admin/voice-settings', {
        headers: { 'x-admin-email': activeAdmin }
      });
      if (res.data) {
        const s: AdminVoiceSettings = res.data.settings;
        if (s) {
          setSelectedVoiceId(s.defaultVoiceId || 'pNInz6obpgDQGcFmaJgB');
          setSelectedVoiceName(s.defaultVoiceName || 'Adam');
          setModelId(s.modelId || 'eleven_multilingual_v2');
          setStability(Number(s.stability ?? 0.45));
          setSimilarityBoost(Number(s.similarityBoost ?? 0.8));
          setStyle(Number(s.style ?? 0.35));
          setSpeed(Number(s.speed ?? 1.05));
          setUseSpeakerBoost(Boolean(s.useSpeakerBoost ?? true));
        }
        if (Array.isArray(res.data.availableVoices) && res.data.availableVoices.length > 0) {
          setVoices(res.data.availableVoices);
        }
        setAdamAvailable(res.data.adamAvailable !== false);
        setAdamError(res.data.adamError || null);
        setVoiceWarning(res.data.lastVoiceError || null);
        if (res.data.usageStats) {
          setUsageStats(res.data.usageStats);
        }
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Could not load ElevenLabs voice settings.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVoiceSettings();
  }, []);

  const handleSelectVoice = (voice: ElevenLabsVoiceOption) => {
    setSelectedVoiceId(voice.voiceId);
    setSelectedVoiceName(voice.name);
    setBanner(null);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    const activeAdmin = adminEmail || 'joshuaocansey731@gmail.com';
    try {
      const res = await axios.post('/api/automation/admin/voice-settings', {
        adminEmail: activeAdmin,
        defaultVoiceId: selectedVoiceId,
        defaultVoiceName: selectedVoiceName,
        modelId,
        stability,
        similarityBoost,
        style,
        speed,
        useSpeakerBoost,
      }, {
        headers: { 'x-admin-email': activeAdmin }
      });
      if (res.data?.success) {
        setBanner({
          type: 'success',
          text:
            res.data.message ||
            `Default ElevenLabs voice saved as "${selectedVoiceName}". Customers will automatically use this voice.`,
        });
        if (selectedVoiceName.toLowerCase() !== 'adam') {
          setAdamError(null);
        }
        if (onSettingsUpdated && res.data.settings) {
          onSettingsUpdated(res.data.settings);
        }
        await fetchVoiceSettings();
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.response?.data?.error || 'Failed to save ElevenLabs voice settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSelectedVoice = async () => {
    setTesting(true);
    setBanner(null);
    const activeAdmin = adminEmail || 'joshuaocansey731@gmail.com';
    try {
      const res = await axios.post('/api/automation/admin/voice-test', {
        adminEmail: activeAdmin,
        sampleText,
        voiceId: selectedVoiceId,
        voiceName: selectedVoiceName,
        modelId,
        stability,
        similarityBoost,
        style,
        speed,
        useSpeakerBoost,
      }, {
        headers: { 'x-admin-email': activeAdmin }
      });
      if (res.data?.success && res.data.audioUrl) {
        const cacheBustedUrl = `${res.data.audioUrl}?t=${Date.now()}`;
        setTestAudioUrl(cacheBustedUrl);
        setTestMeta({
          voiceName: res.data.voiceName || selectedVoiceName,
          durationSec: res.data.durationSec || 8,
          fromCache: Boolean(res.data.fromCache),
        });
        if (res.data.adamError) {
          setAdamError(res.data.adamError);
        }
        setTimeout(() => {
          audioRef.current?.play().catch(() => {});
        }, 100);
        await fetchVoiceSettings();
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        text:
          err?.response?.data?.error ||
          'Voice test failed. Please verify the selected ElevenLabs voice.',
      });
    } finally {
      setTesting(false);
    }
  };

  const applyStudioPreset = (preset: 'adam_studio' | 'broadcast' | 'viral') => {
    if (preset === 'adam_studio') {
      setStability(0.42);
      setSimilarityBoost(0.85);
      setStyle(0.42);
      setSpeed(1.02);
      setUseSpeakerBoost(true);
      setBanner({
        type: 'success',
        text: 'Applied "Deep Studio Adam" preset (warm baritone chest EQ, 42% stability, 85% similarity, 42% style, 1.02x pacing). Click Save to persist.',
      });
    } else if (preset === 'broadcast') {
      setStability(0.6);
      setSimilarityBoost(0.85);
      setStyle(0.25);
      setSpeed(1.04);
      setUseSpeakerBoost(true);
      setBanner({
        type: 'success',
        text: 'Applied "Broadcast News Anchor" preset (composed authority, 60% stability, 85% similarity, 1.04x pacing). Click Save to persist.',
      });
    } else {
      setStability(0.35);
      setSimilarityBoost(0.8);
      setStyle(0.55);
      setSpeed(1.08);
      setUseSpeakerBoost(true);
      setBanner({
        type: 'success',
        text: 'Applied "High-Energy Viral Creator" preset (dynamic inflection, 35% stability, 55% style, 1.08x pacing). Click Save to persist.',
      });
    }
  };

  return (
    <div className="bg-[#12161f] border border-white/10 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrator Voice Configuration · ElevenLabs Backend Engine</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-blue-400" />
            <span>Admin Voice Settings (ElevenLabs)</span>
          </h2>
          <p className="text-xs text-gray-400">
            Customers never need to configure voice settings. Every automated video automatically uses your selected default ElevenLabs voice (Default: <strong className="text-white">Adam</strong>).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchVoiceSettings}
          disabled={loading}
          className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Voices</span>
        </button>
      </div>

      {/* Clear Error Alert if Adam Voice is Unavailable on Connected ElevenLabs Account */}
      {(!adamAvailable || adamError) && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl flex items-start gap-3 text-amber-200 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-300">
              Adam Voice Unavailable on Connected ElevenLabs Account
            </div>
            <p>
              {adamError ||
                "The default 'Adam' voice is currently unavailable through the connected ElevenLabs account. Please select another available ElevenLabs voice below and click Save Default Voice."}
            </p>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
            banner.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/40 border-red-500/30 text-red-200'
          }`}
        >
          {banner.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Voice Usage & $1/Month Profitability Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#0b0e14] border border-white/10 rounded-xl space-y-1">
          <span className="text-[11px] text-gray-400 font-medium">Active Default Voice</span>
          <div className="text-base font-black text-white truncate">
            {selectedVoiceName}
          </div>
          <span className="text-[11px] text-blue-400 font-mono block truncate">
            ID: {selectedVoiceId.slice(0, 12)}...
          </span>
        </div>

        <div className="p-3.5 bg-[#0b0e14] border border-white/10 rounded-xl space-y-1">
          <span className="text-[11px] text-gray-400 font-medium">Characters Synthesized</span>
          <div className="text-base font-black text-white font-mono">
            {usageStats.totalVoiceCharactersUsed.toLocaleString()}
          </div>
          <span className="text-[11px] text-gray-500 block">
            {usageStats.totalVoiceApiCalls} ElevenLabs API calls
          </span>
        </div>

        <div className="p-3.5 bg-[#0b0e14] border border-white/10 rounded-xl space-y-1">
          <span className="text-[11px] text-gray-400 font-medium">Audio Cache Hits (Saved)</span>
          <div className="text-base font-black text-emerald-400 font-mono">
            {usageStats.totalVoiceCacheHits}
          </div>
          <span className="text-[11px] text-gray-500 block">
            Zero duplicate voice regeneration
          </span>
        </div>

        <div className="p-3.5 bg-[#0b0e14] border border-white/10 rounded-xl space-y-1">
          <span className="text-[11px] text-gray-400 font-medium">$1/mo Plan Cost Control</span>
          <div className="text-base font-black text-white font-mono">
            ${usageStats.estimatedVoiceCostUsd.toFixed(3)}
          </div>
          <span className="text-[11px] text-gray-500 block">
            Cap: {usageStats.proPlanMonthlyCharBudget.toLocaleString()} chars/mo per Pro user
          </span>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Select Default ElevenLabs Voice (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-300">
              1. Select Default ElevenLabs Voice
            </label>
            <span className="text-xs text-gray-400">
              Default: <strong className="text-white">Adam</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {voices.map((v) => {
              const isSelected =
                selectedVoiceId === v.voiceId ||
                selectedVoiceName.toLowerCase() === v.name.toLowerCase();
              const isAdam = v.name.toLowerCase() === 'adam';

              return (
                <button
                  key={v.voiceId}
                  type="button"
                  onClick={() => handleSelectVoice(v)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-[#0b0e14] border-white/10 text-gray-300 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>{v.name}</span>
                      {isAdam && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                          · Default
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                    {v.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* ElevenLabs Model Selector */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
              ElevenLabs Voice Model
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0b0e14] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="eleven_multilingual_v2">
                Eleven Multilingual v2 (Highest Expressive Quality for Motivation)
              </option>
              <option value="eleven_turbo_v2_5">
                Eleven Turbo v2.5 (Low-Latency Fast Narration)
              </option>
              <option value="eleven_monolingual_v1">
                Eleven English v1 (Classic Narrative Voice)
              </option>
            </select>
          </div>
        </div>

        {/* Right: Stability, Similarity, Style & Speed Controls (5 cols) */}
        <div className="lg:col-span-5 bg-[#0b0e14] border border-white/10 rounded-xl p-4 space-y-4">
          <div className="space-y-2 border-b border-white/10 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-300">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>2. Studio Voice Delivery &amp; Mastering</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => applyStudioPreset('adam_studio')}
                className="px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg text-[11px] font-bold text-blue-200 transition-colors cursor-pointer"
              >
                Deep Studio Adam
              </button>
              <button
                type="button"
                onClick={() => applyStudioPreset('broadcast')}
                className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-300 transition-colors cursor-pointer"
              >
                Broadcast Anchor
              </button>
              <button
                type="button"
                onClick={() => applyStudioPreset('viral')}
                className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-300 transition-colors cursor-pointer"
              >
                High-Energy Viral
              </button>
            </div>
          </div>

          {/* Stability */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 font-medium">Stability (Expressive vs. Consistent)</span>
              <span className="font-mono text-white font-bold">{Math.round(stability * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={stability}
              onChange={(e) => setStability( parseFloat(e.target.value) )}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <p className="text-[11px] text-gray-500">
              40–50% gives natural, expressive inflection for motivational scripts.
            </p>
          </div>

          {/* Similarity Boost */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 font-medium">Similarity Boost (Clarity &amp; Fidelity)</span>
              <span className="font-mono text-white font-bold">
                {Math.round(similarityBoost * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={similarityBoost}
              onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Style Exaggeration */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 font-medium">Style Exaggeration (Motivational Energy)</span>
              <span className="font-mono text-white font-bold">{Math.round(style * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={style}
              onChange={(e) => setStyle(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Speaking Speed */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-300 font-medium">Speaking Speed (0.7x – 1.2x)</span>
              <span className="font-mono text-white font-bold">{speed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.7"
              max="1.2"
              step="0.05"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <p className="text-[11px] text-gray-500">
              1.05x delivers crisp, high-retention pacing for 30–60s vertical videos.
            </p>
          </div>

          {/* Speaker Boost Toggle */}
          <label className="flex items-center justify-between pt-1 cursor-pointer">
            <span className="text-xs text-gray-300 font-medium">ElevenLabs Speaker Boost</span>
            <input
              type="checkbox"
              checked={useSpeakerBoost}
              onChange={(e) => setUseSpeakerBoost(e.target.checked)}
              className="w-4 h-4 accent-blue-500 rounded"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Default Voice...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Default Voice ({selectedVoiceName})</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Test the Selected Voice Section */}
      <div className="bg-[#0b0e14] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              3. Test Selected Voice ({selectedVoiceName})
            </h3>
            <p className="text-xs text-gray-400">
              Preview how {selectedVoiceName} sounds with your current stability, style, and speaking speed settings.
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestSelectedVoice}
            disabled={testing}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span>Generating Voice Sample...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-blue-400" />
                <span>Test {selectedVoiceName} Voice</span>
              </>
            )}
          </button>
        </div>

        <textarea
          rows={2}
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value)}
          placeholder="Enter sample motivational script to test..."
          className="w-full px-3.5 py-2.5 bg-[#12161f] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
        />

        {testAudioUrl && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <audio ref={audioRef} src={testAudioUrl} controls className="h-9 w-full sm:w-80" />
            {testMeta && (
              <span className="text-[11px] text-gray-400 font-mono">
                Voice: {testMeta.voiceName} · {testMeta.durationSec}s ·{' '}
                {testMeta.fromCache ? 'Loaded from cache (0 API cost)' : 'Freshly synthesized'}
              </span>
            )}
          </div>
        )}

        {voiceWarning && !adamError && (
          <p className="text-[11px] text-amber-300/90">
            Note: {voiceWarning}
          </p>
        )}
      </div>
    </div>
  );
}

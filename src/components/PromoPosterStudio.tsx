import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Download, 
  Sparkles, 
  RefreshCw, 
  QrCode as QrIcon, 
  Smartphone, 
  Layers, 
  Sliders, 
  Share2, 
  Check, 
  ExternalLink, 
  Copy, 
  Eye, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ShieldCheck, 
  Clock, 
  Users, 
  Globe, 
  Newspaper, 
  MessageSquare, 
  TrendingUp, 
  FileText,
  Maximize2,
  Image as ImageIcon
} from 'lucide-react';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import axios from 'axios';

interface PromoPosterStudioProps {
  onBack?: () => void;
}

export type PosterFormat = 'a4_flyer' | 'social_square' | 'story_vertical';
export type PosterTheme = 'royal_navy' | 'breaking_crimson' | 'ghana_gold' | 'midnight_dark';

export interface PosterConfig {
  tagline: string;
  ribbonText: string;
  milestonePrefix: string;
  milestoneNumber: string;
  badgeSubtext: string;
  websiteUrl: string;
  domainDisplay: string;
  scanCtaText: string;
  visitCtaText: string;
  footerText: string;
  breakingTag: string;
  breakingHeadline: string;
  topStories: string[];
  features: {
    title: string;
    description: string;
  }[];
  format: PosterFormat;
  theme: PosterTheme;
}

const DEFAULT_CONFIG: PosterConfig = {
  tagline: "YOUR WORLD. YOUR NEWS. YOUR VOICE.",
  ribbonText: "BE ONE OF OUR",
  milestonePrefix: "FIRST",
  milestoneNumber: "1,000",
  badgeSubtext: "FOUNDING READERS!",
  websiteUrl: "https://globalnews.site",
  domainDisplay: "globalnews.site",
  scanCtaText: "SCAN ME!",
  visitCtaText: "VISIT NOW",
  footerText: "VISIT TODAY: globalnews.site",
  breakingTag: "BREAKING NEWS",
  breakingHeadline: "Ghana's Economy Shows Positive Growth In Q1 2026",
  topStories: [
    "Parliament Approves New Education Policy",
    "Black Stars Qualify For AFCON 2026",
    "Tech Innovations Changing Africa"
  ],
  features: [
    { title: "ACCURATE.", description: "We deliver verified and reliable news." },
    { title: "FAST.", description: "Breaking stories as they happen." },
    { title: "RELEVANT.", description: "News that affects your life." },
    { title: "GLOBAL & LOCAL.", description: "From your community to the world." }
  ],
  format: "a4_flyer",
  theme: "royal_navy"
};

const CAMPAIGN_PRESETS: { name: string; description: string; config: Partial<PosterConfig> }[] = [
  {
    name: "Founding 1,000 Readers (Original)",
    description: "The official launch milestone flyer matching the reference design.",
    config: {
      ribbonText: "BE ONE OF OUR",
      milestonePrefix: "FIRST",
      milestoneNumber: "1,000",
      badgeSubtext: "FOUNDING READERS!",
      breakingHeadline: "Ghana's Economy Shows Positive Growth In Q1 2026",
      theme: "royal_navy"
    }
  },
  {
    name: "Campus & Youth Ambassadors",
    description: "Tailored for universities (Legon, KNUST, UCC) & youth communities.",
    config: {
      ribbonText: "BECOME A CAMPUS AMBASSADOR",
      milestonePrefix: "TOP",
      milestoneNumber: "2,500",
      badgeSubtext: "STUDENT MEMBERS!",
      breakingHeadline: "University Tech Hubs Expand Across Ghana in 2026",
      topStories: [
        "Youth Innovation Grants Announced",
        "National Student Debate Championship",
        "Free Media Literacy Workshops This Friday"
      ],
      theme: "royal_navy"
    }
  },
  {
    name: "Breaking News & Africa Focus",
    description: "Highlighting 24/7 real-time journalism and verified local reporting.",
    config: {
      ribbonText: "STAY AHEAD OF EVERY HEADLINE",
      milestonePrefix: "JOIN",
      milestoneNumber: "10,000+",
      badgeSubtext: "DAILY INFORMED READERS!",
      breakingHeadline: "West Africa Trade Agreement Unlocks New Tech Corridors",
      theme: "breaking_crimson"
    }
  },
  {
    name: "100% Free All-Access Edition",
    description: "Promoting free unlimited news, ad-free streaming, and AI video automation.",
    config: {
      ribbonText: "100% FREE COMMUNITY LAUNCH",
      milestonePrefix: "JOIN",
      milestoneNumber: "FREE",
      badgeSubtext: "UNLIMITED NEWS & MOVIES!",
      breakingHeadline: "Stream HD Trailers & Read 100% Free on Any Phone",
      topStories: [
        "Exclusive Ghanaian Cinema Premieres",
        "Zero Distractions, Zero Fees",
        "AI Content Automation Studio Included"
      ],
      theme: "ghana_gold"
    }
  }
];

export default function PromoPosterStudio({ onBack }: PromoPosterStudioProps) {
  const [config, setConfig] = useState<PosterConfig>(DEFAULT_CONFIG);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'editor' | 'campaigns' | 'ai_copy'>('editor');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiAudience, setAiAudience] = useState<string>("University students and young professionals in Accra and Kumasi");
  const [aiTheme, setAiTheme] = useState<string>("Founding Readers & First 1,000 Milestone");
  const [viewOriginalComparison, setViewOriginalComparison] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const posterRef = useRef<HTMLDivElement>(null);

  // Generate QR code whenever websiteUrl changes
  useEffect(() => {
    let isSubscribed = true;
    QRCode.toDataURL(config.websiteUrl || "https://globalnews.site", {
      width: 400,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    }).then(url => {
      if (isSubscribed) setQrCodeDataUrl(url);
    }).catch(err => {
      console.error("QR Code generation error:", err);
    });

    return () => { isSubscribed = false; };
  }, [config.websiteUrl]);

  // Handle browser print (pure flyer printed on full sheet)
  const handlePrint = () => {
    window.print();
  };

  // Download high-resolution PNG image
  const handleDownloadPng = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      // Export at 2.5x pixel ratio for print shop clarity
      const dataUrl = await toPng(posterRef.current, {
        quality: 0.98,
        pixelRatio: 2.5,
        backgroundColor: '#070c18',
        cacheBust: true,
      });

      const link = document.createElement('a');
      link.download = `globalnews-promo-poster-${config.milestoneNumber.replace(/[^a-zA-Z0-9]/g, '')}.png`;
      link.href = dataUrl;
      link.click();

      setExportSuccessMsg("High-resolution promotional poster downloaded successfully!");
      setTimeout(() => setExportSuccessMsg(''), 4500);
    } catch (err: any) {
      console.error("Failed to export poster image:", err);
      alert("Failed to export image. You can also use the 'Print' button or save as PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  // Download print-ready PDF
  const handleDownloadPdf = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(posterRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#070c18',
      });

      const pdf = new jsPDF({
        orientation: config.format === 'social_square' ? 'portrait' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`globalnews-flyer-a4-${Date.now()}.pdf`);

      setExportSuccessMsg("Print-ready A4 PDF document generated!");
      setTimeout(() => setExportSuccessMsg(''), 4500);
    } catch (err) {
      console.error("Failed to export PDF:", err);
      alert("PDF generation failed. You can use 'Print' -> 'Save as PDF' from your browser.");
    } finally {
      setIsExporting(false);
    }
  };

  // Load real-time headlines from app live feed
  const handleSyncLiveNews = async () => {
    try {
      const res = await axios.get('/api/news?category=Top%20Stories');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const topItem = res.data[0];
        const nextItems = res.data.slice(1, 4).map((item: any) => item.title);

        setConfig(prev => ({
          ...prev,
          breakingHeadline: topItem.title || prev.breakingHeadline,
          topStories: nextItems.length >= 2 ? nextItems : prev.topStories
        }));

        setExportSuccessMsg("Synced with today's live breaking headlines from Global News!");
        setTimeout(() => setExportSuccessMsg(''), 4000);
      }
    } catch (e) {
      console.error("Failed to sync live news:", e);
    }
  };

  // Generate promotional copy via AI
  const handleGenerateAiCopy = async () => {
    setIsAiGenerating(true);
    try {
      const res = await axios.post('/api/generate-promo-copy', {
        targetAudience: aiAudience,
        campaignTheme: aiTheme
      });

      if (res.data) {
        setConfig(prev => ({
          ...prev,
          ribbonText: res.data.ribbon || prev.ribbonText,
          milestonePrefix: res.data.milestonePrefix || prev.milestonePrefix,
          milestoneNumber: res.data.milestoneNumber || prev.milestoneNumber,
          badgeSubtext: res.data.badgeSubtext || prev.badgeSubtext,
          tagline: res.data.tagline || prev.tagline,
          breakingHeadline: res.data.breakingHeadline || prev.breakingHeadline,
          topStories: Array.isArray(res.data.topStories) && res.data.topStories.length > 0 
            ? res.data.topStories 
            : prev.topStories,
          scanCtaText: res.data.scanCta || prev.scanCtaText,
          visitCtaText: res.data.visitCta || prev.visitCtaText,
          footerText: res.data.footerText || prev.footerText
        }));

        setExportSuccessMsg("AI generated new promotional copy tailored to your campaign!");
        setTimeout(() => setExportSuccessMsg(''), 4500);
        setActiveTab('editor');
      }
    } catch (e) {
      console.error("AI Copy error:", e);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const copyPosterLink = () => {
    navigator.clipboard.writeText(config.websiteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Color theme variables
  const getThemeStyles = () => {
    switch (config.theme) {
      case 'breaking_crimson':
        return {
          bgGradient: 'from-[#140608] via-[#0a0507] to-[#1a080c]',
          accentGold: '#F59E0B',
          bannerBg: 'bg-gradient-to-r from-red-600 to-rose-700',
          ribbonShadow: 'shadow-red-950/60'
        };
      case 'ghana_gold':
        return {
          bgGradient: 'from-[#06140e] via-[#050f0c] to-[#0d1f18]',
          accentGold: '#EAB308',
          bannerBg: 'bg-gradient-to-r from-amber-500 to-yellow-600',
          ribbonShadow: 'shadow-amber-950/60'
        };
      case 'midnight_dark':
        return {
          bgGradient: 'from-[#050505] via-[#09090b] to-[#040404]',
          accentGold: '#38BDF8',
          bannerBg: 'bg-gradient-to-r from-cyan-600 to-blue-700',
          ribbonShadow: 'shadow-cyan-950/60'
        };
      case 'royal_navy':
      default:
        return {
          bgGradient: 'from-[#040b17] via-[#071324] to-[#030914]',
          accentGold: '#FFCC00',
          bannerBg: 'bg-gradient-to-r from-[#e5192d] to-[#bd0c1f]',
          ribbonShadow: 'shadow-red-950/80'
        };
    }
  };

  const themeStyle = getThemeStyles();

  return (
    <div className="min-h-screen text-white pb-20">
      {/* Top Banner / Studio Navigation (Hidden when printing) */}
      <div className="no-print bg-[#111723] border-b border-white/10 px-4 py-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-yellow-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-yellow-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Promotion Post &amp; Physical Flyer Studio
                </h1>
                <span className="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Print Ready 300 DPI
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Generate, customize &amp; print high-converting physical posters for streets, campus noticeboards, cafes, and social media.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setViewOriginalComparison(!viewOriginalComparison)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                viewOriginalComparison
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
              title="Compare with the original uploaded flyer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{viewOriginalComparison ? 'Viewing Original Reference' : 'Compare Reference'}</span>
            </button>

            <a
              href="/promo-poster-reference.png"
              download="globalnews-founding-readers-original.png"
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              title="Download original reference graphic file (1.9MB)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Original PNG</span>
            </a>

            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Poster</span>
            </button>

            <button
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download High-Res PNG</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF (A4)</span>
            </button>
          </div>
        </div>

        {/* Success toast banner */}
        {exportSuccessMsg && (
          <div className="mt-3 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2 max-w-7xl mx-auto animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{exportSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Main Workspace: Left Controls (no-print) + Right Poster Canvas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Controls & Campaign Customizer (no-print) */}
          <div className="no-print lg:col-span-5 space-y-6">
            
            {/* Tabs: Customizer / Presets / AI Copy */}
            <div className="flex items-center gap-1 bg-[#121622] p-1.5 rounded-2xl border border-white/10">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'editor'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Customizer</span>
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'campaigns'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Presets</span>
              </button>
              <button
                onClick={() => setActiveTab('ai_copy')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'ai_copy'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                <span>AI Copy</span>
              </button>
            </div>

            {/* TAB 1: CUSTOMIZER CONTROLS */}
            {activeTab === 'editor' && (
              <div className="bg-[#121622] border border-white/10 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    <span>Flyer Text &amp; Milestone</span>
                  </h3>
                  <button
                    onClick={() => setConfig(DEFAULT_CONFIG)}
                    className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
                    title="Reset to original design"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                {/* Hero Milestone Badge Settings */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Top Ribbon Header
                    </label>
                    <input
                      type="text"
                      value={config.ribbonText}
                      onChange={(e) => setConfig({ ...config, ribbonText: e.target.value })}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. BE ONE OF OUR"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                        Prefix Word
                      </label>
                      <input
                        type="text"
                        value={config.milestonePrefix}
                        onChange={(e) => setConfig({ ...config, milestonePrefix: e.target.value })}
                        className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                        placeholder="e.g. FIRST"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                        Milestone Number
                      </label>
                      <input
                        type="text"
                        value={config.milestoneNumber}
                        onChange={(e) => setConfig({ ...config, milestoneNumber: e.target.value })}
                        className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm font-black text-red-400 focus:outline-none focus:border-red-500"
                        placeholder="e.g. 1,000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Milestone Ribbon Tag
                    </label>
                    <input
                      type="text"
                      value={config.badgeSubtext}
                      onChange={(e) => setConfig({ ...config, badgeSubtext: e.target.value })}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. FOUNDING READERS!"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Official Tagline
                    </label>
                    <input
                      type="text"
                      value={config.tagline}
                      onChange={(e) => setConfig({ ...config, tagline: e.target.value })}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="YOUR WORLD. YOUR NEWS. YOUR VOICE."
                    />
                  </div>
                </div>

                {/* QR Code & Web Link Settings */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                      Website URL &amp; QR Destination
                    </label>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <QrIcon className="w-3 h-3" />
                      Live QR Enabled
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={config.websiteUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        const domainClean = val.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                        setConfig({
                          ...config,
                          websiteUrl: val,
                          domainDisplay: domainClean || 'globalnews.site'
                        });
                      }}
                      className="flex-1 bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                      placeholder="https://globalnews.site"
                    />
                    <button
                      type="button"
                      onClick={copyPosterLink}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                      title="Copy URL"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Phone Mockup Screen Content */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                      Phone Mockup Headlines
                    </label>
                    <button
                      type="button"
                      onClick={handleSyncLiveNews}
                      className="text-[11px] text-yellow-400 hover:text-yellow-300 font-bold flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync Real News</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Breaking Headline</label>
                    <input
                      type="text"
                      value={config.breakingHeadline}
                      onChange={(e) => setConfig({ ...config, breakingHeadline: e.target.value })}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] text-gray-400">Top Stories (Bullet points)</label>
                    {config.topStories.map((story, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={story}
                        onChange={(e) => {
                          const updated = [...config.topStories];
                          updated[idx] = e.target.value;
                          setConfig({ ...config, topStories: updated });
                        }}
                        className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    ))}
                  </div>
                </div>

                {/* Color Theme Selector */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                    Color Theme
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, theme: 'royal_navy' })}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                        config.theme === 'royal_navy'
                          ? 'bg-blue-900/40 border-blue-500 text-white'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      Royal Navy &amp; Gold (Original)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, theme: 'breaking_crimson' })}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                        config.theme === 'breaking_crimson'
                          ? 'bg-red-900/40 border-red-500 text-white'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      Breaking Crimson Alert
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, theme: 'ghana_gold' })}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                        config.theme === 'ghana_gold'
                          ? 'bg-amber-900/40 border-amber-500 text-white'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      Ghana Green &amp; Gold
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, theme: 'midnight_dark' })}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                        config.theme === 'midnight_dark'
                          ? 'bg-cyan-900/40 border-cyan-500 text-white'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      Midnight Obsidian
                    </button>
                  </div>
                </div>

                {/* Aspect Ratio / Format Selector */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                    Poster Format &amp; Output Size
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, format: 'a4_flyer' })}
                      className={`p-2 rounded-xl border text-center text-xs font-bold transition-all ${
                        config.format === 'a4_flyer'
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400'
                      }`}
                    >
                      A4 Flyer (3:4)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, format: 'social_square' })}
                      className={`p-2 rounded-xl border text-center text-xs font-bold transition-all ${
                        config.format === 'social_square'
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400'
                      }`}
                    >
                      Square (1:1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, format: 'story_vertical' })}
                      className={`p-2 rounded-xl border text-center text-xs font-bold transition-all ${
                        config.format === 'story_vertical'
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#0a0e17] border-white/10 text-gray-400'
                      }`}
                    >
                      Story (9:16)
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: CAMPAIGN PRESETS */}
            {activeTab === 'campaigns' && (
              <div className="bg-[#121622] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <h3 className="font-bold text-white text-sm">Pre-designed Promotion Campaigns</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Select a curated milestone campaign designed for local printing or social media drives.
                  </p>
                </div>

                <div className="space-y-3">
                  {CAMPAIGN_PRESETS.map((preset, i) => (
                    <div
                      key={i}
                      className="p-4 bg-[#0a0e17] border border-white/10 rounded-xl hover:border-blue-500/50 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{preset.name}</span>
                        <button
                          type="button"
                          onClick={() => setConfig(prev => ({ ...prev, ...preset.config }))}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Apply Preset
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">{preset.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: AI COPYWRITER */}
            {activeTab === 'ai_copy' && (
              <div className="bg-[#121622] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <h3 className="font-bold text-white text-sm">AI Campaign Copywriter</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Generate punchy headlines, hooks, and milestones tailored to your exact target audience in Ghana or globally.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      value={aiAudience}
                      onChange={(e) => setAiAudience(e.target.value)}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. University students, football fans, business professionals in Accra"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Campaign Angle / Goal
                    </label>
                    <input
                      type="text"
                      value={aiTheme}
                      onChange={(e) => setAiTheme(e.target.value)}
                      className="w-full bg-[#0a0e17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. 5,000 Milestone, Campus Ambassador Drive, VIP Launch"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAiCopy}
                    disabled={isAiGenerating}
                    className="w-full py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-yellow-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isAiGenerating ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-black" />
                    )}
                    <span>{isAiGenerating ? 'Writing Copy with Gemini...' : 'Generate New Campaign Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Print Shop Guidelines Card */}
            <div className="bg-[#0b101b] border border-white/10 rounded-2xl p-4 text-xs text-gray-400 space-y-2">
              <div className="flex items-center gap-2 text-yellow-400 font-bold">
                <Printer className="w-4 h-4" />
                <span>Tips for Physical Printing</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li><strong>Paper size:</strong> Standard A4 (210 × 297 mm) or US Letter.</li>
                <li><strong>Stock weight:</strong> 150gsm–250gsm gloss/matte art paper for vibrant colors.</li>
                <li><strong>Resolution:</strong> The downloaded PNG is rendered in ultra-crisp 2.5× scale (~2400px wide).</li>
                <li><strong>QR Code:</strong> Test scanned with phone camera at arm's length before bulk print.</li>
              </ul>
            </div>

          </div>

          {/* RIGHT COLUMN: Live Interactive Physical Poster Canvas */}
          <div className="lg:col-span-7 flex flex-col items-center">
            
            {/* Canvas Zoom & View Switcher Bar (no-print) */}
            <div className="no-print w-full flex items-center justify-between pb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400">Preview Scale:</span>
                <div className="flex items-center bg-[#141a27] border border-white/10 rounded-xl p-0.5">
                  <button
                    onClick={() => setZoomLevel(Math.max(60, zoomLevel - 15))}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs font-mono font-bold text-gray-200">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel(Math.min(130, zoomLevel + 15))}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="px-2 py-1 text-[10px] font-bold text-blue-400 hover:text-blue-300"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>1-Click Print</span>
                </button>
              </div>
            </div>

            {/* SIDE-BY-SIDE OR TOGGLE VIEW WITH ORIGINAL REFERENCE */}
            {viewOriginalComparison ? (
              <div className="w-full bg-[#121622] border border-blue-500/40 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span>
                    <h4 className="font-bold text-sm text-white">Original Uploaded Reference Flyer</h4>
                  </div>
                  <a
                    href="/promo-poster-reference.png"
                    download="globalnews-founding-readers-original.png"
                    className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Original (1.9MB)</span>
                  </a>
                </div>
                <div className="flex justify-center bg-black/60 rounded-xl p-2 border border-white/10 max-h-[600px] overflow-auto">
                  <img
                    src="/promo-poster-reference.png"
                    alt="Original Global News Physical Promotion Flyer"
                    className="max-h-[560px] object-contain rounded-lg shadow-2xl"
                  />
                </div>
              </div>
            ) : null}

            {/* THE PHYSICAL POSTER CONTAINER (Target for Print & Export) */}
            <div 
              className="w-full flex justify-center overflow-x-auto pb-8 print-poster-target"
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center'
              }}
            >
              {/* THE MASTER PHYSICAL PROMOTION POSTER (Exact 1:1 Recreation) */}
              <div
                ref={posterRef}
                id="globalnews-physical-poster"
                className={`relative w-[640px] ${
                  config.format === 'social_square' 
                    ? 'h-[640px]' 
                    : config.format === 'story_vertical' 
                    ? 'min-h-[1138px]' 
                    : 'min-h-[905px]'
                } bg-gradient-to-b ${themeStyle.bgGradient} text-white font-sans overflow-hidden select-none shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] border border-white/10 flex flex-col justify-between`}
                style={{
                  boxSizing: 'border-box'
                }}
              >
                {/* Background Texture & Cosmic Radial Glows */}
                <div 
                  className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"
                />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-600/15 blur-[100px] pointer-events-none rounded-full" />
                <div className="absolute top-[35%] right-0 w-[350px] h-[350px] bg-amber-500/10 blur-[90px] pointer-events-none rounded-full" />

                {/* ========================================================
                    TOP HEADER SECTION: Logo + Brand + Tagline
                   ======================================================== */}
                <div className="relative pt-6 px-8 text-center z-10 flex flex-col items-center">
                  
                  {/* Global News Official Emblem (Globe + Swirling Gold Ring) */}
                  <div className="relative w-28 h-20 flex items-center justify-center">
                    <svg className="w-24 h-24" viewBox="0 0 100 100" fill="none">
                      {/* Deep Planet Circle */}
                      <circle cx="50" cy="50" r="34" fill="#0C2340" stroke="#1D4ED8" strokeWidth="2" />
                      
                      {/* Continents (Stylized White/Cyan landmasses) */}
                      <path 
                        d="M38 32C42 30 48 35 46 40C44 45 36 44 34 38C32 34 35 33 38 32Z" 
                        fill="#FFFFFF" 
                        opacity="0.95" 
                      />
                      <path 
                        d="M48 42C52 40 58 43 56 50C54 58 48 64 45 68C43 65 42 58 44 52C45 47 46 44 48 42Z" 
                        fill="#FFFFFF" 
                        opacity="0.95" 
                      />
                      <path 
                        d="M58 35C62 33 66 36 65 42C64 46 60 48 57 44C55 40 56 37 58 35Z" 
                        fill="#FFFFFF" 
                        opacity="0.95" 
                      />
                      
                      {/* Swirling Golden Ring Arc */}
                      <path 
                        d="M20 62C24 72 38 78 54 75C70 72 82 60 84 48" 
                        stroke="#FFCC00" 
                        strokeWidth="5" 
                        strokeLinecap="round" 
                      />
                      {/* Secondary Orange Swoosh Ring */}
                      <path 
                        d="M16 54C18 68 34 82 56 80C74 78 86 64 88 52" 
                        stroke="#F97316" 
                        strokeWidth="3.5" 
                        strokeLinecap="round" 
                        opacity="0.85" 
                      />
                    </svg>
                  </div>

                  {/* Main Logo Text: "GLOBAL NEWS" */}
                  <div className="flex items-center justify-center gap-2 mt-0">
                    <h1 className="text-4xl sm:text-[46px] font-black tracking-tight text-white leading-none uppercase">
                      GLOBAL
                    </h1>
                    <span 
                      className="text-4xl sm:text-[46px] font-black tracking-tight leading-none uppercase drop-shadow-md"
                      style={{ color: themeStyle.accentGold }}
                    >
                      NEWS
                    </span>
                  </div>

                  {/* Tagline Bar with Golden Divider Lines */}
                  <div className="flex items-center justify-center gap-3 w-full max-w-[460px] mt-2">
                    <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent to-[#FFCC00]" />
                    <p className="text-[11px] font-extrabold tracking-[0.16em] text-gray-200 uppercase whitespace-nowrap">
                      {config.tagline}
                    </p>
                    <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent to-[#FFCC00]" />
                  </div>
                </div>

                {/* ========================================================
                    HERO PROMOTIONAL BODY: Badge + 3D Smartphone Mockup
                   ======================================================== */}
                <div className="relative z-10 px-6 pt-5 grid grid-cols-12 gap-3 items-center">
                  
                  {/* LEFT HERO COLUMN (7 Cols): Red Ribbon + Giant Milestone Plaque + Features */}
                  <div className="col-span-7 flex flex-col items-start pr-1">
                    
                    {/* Folded 3D Red Ribbon: "BE ONE OF OUR" */}
                    <div className="relative -ml-4 pl-6 pr-8 py-1.5 bg-gradient-to-r from-[#D31027] to-[#EA384D] text-white font-black text-sm tracking-wider uppercase shadow-lg shadow-red-950/60 z-20">
                      {/* Left Ribbon Notch Fold */}
                      <div className="absolute left-0 top-0 bottom-0 w-3 bg-[#8B0000] -skew-x-12" />
                      {/* Ribbon Tail on Right */}
                      <div className="absolute right-0 top-0 bottom-0 w-4 bg-[#8B0000] clip-path-ribbon" />
                      <span className="relative z-10 text-[13px] tracking-[0.08em] drop-shadow-sm">
                        {config.ribbonText}
                      </span>
                    </div>

                    {/* Textured Distressed Gold Badge Box */}
                    <div 
                      className="relative w-full mt-[-6px] rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-center border-4 border-[#B48200]"
                      style={{
                        background: 'linear-gradient(135deg, #F9D423 0%, #FFB300 50%, #E69500 100%)',
                      }}
                    >
                      {/* Grunge/distressed edge effect */}
                      <div className="text-center">
                        <div className="text-[#09152C] font-black text-4xl sm:text-[42px] leading-none tracking-tight uppercase">
                          {config.milestonePrefix}
                        </div>
                        <div className="text-[#D31027] font-black text-6xl sm:text-[72px] leading-[0.88] tracking-tighter drop-shadow-sm font-sans">
                          {config.milestoneNumber}
                        </div>
                      </div>

                      {/* Navy Blue Banner Tab: "FOUNDING READERS!" */}
                      <div className="w-[108%] -mb-7 mt-2 py-2 bg-[#0C1E3C] text-white text-center font-black text-sm tracking-wider uppercase rounded-lg shadow-xl border-2 border-[#1E3A6D]">
                        <span className="tracking-[0.06em] text-[13px] text-yellow-300">
                          {config.badgeSubtext}
                        </span>
                      </div>
                    </div>

                    {/* 4 Feature Points with Gold-Bordered Square Icons */}
                    <div className="mt-10 space-y-2.5 w-full">
                      
                      {/* Item 1: ACCURATE */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0C1E3C] border border-[#FFCC00] flex items-center justify-center flex-shrink-0 text-[#FFCC00] shadow-sm">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wide leading-tight">
                            {config.features[0]?.title || "ACCURATE."}
                          </h4>
                          <p className="text-[10px] text-gray-300 font-medium leading-tight mt-0.5">
                            {config.features[0]?.description || "We deliver verified and reliable news."}
                          </p>
                        </div>
                      </div>

                      {/* Item 2: FAST */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0C1E3C] border border-[#FFCC00] flex items-center justify-center flex-shrink-0 text-[#FFCC00] shadow-sm">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wide leading-tight">
                            {config.features[1]?.title || "FAST."}
                          </h4>
                          <p className="text-[10px] text-gray-300 font-medium leading-tight mt-0.5">
                            {config.features[1]?.description || "Breaking stories as they happen."}
                          </p>
                        </div>
                      </div>

                      {/* Item 3: RELEVANT */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0C1E3C] border border-[#FFCC00] flex items-center justify-center flex-shrink-0 text-[#FFCC00] shadow-sm">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wide leading-tight">
                            {config.features[2]?.title || "RELEVANT."}
                          </h4>
                          <p className="text-[10px] text-gray-300 font-medium leading-tight mt-0.5">
                            {config.features[2]?.description || "News that affects your life."}
                          </p>
                        </div>
                      </div>

                      {/* Item 4: GLOBAL & LOCAL */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0C1E3C] border border-[#FFCC00] flex items-center justify-center flex-shrink-0 text-[#FFCC00] shadow-sm">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wide leading-tight">
                            {config.features[3]?.title || "GLOBAL & LOCAL."}
                          </h4>
                          <p className="text-[10px] text-gray-300 font-medium leading-tight mt-0.5">
                            {config.features[3]?.description || "From your community to the world."}
                          </p>
                        </div>
                      </div>

                    </div>

                  </div>

                  {/* RIGHT HERO COLUMN (5 Cols): 3D Realistic Smartphone Mockup */}
                  <div className="col-span-5 flex justify-center items-center pl-1">
                    
                    {/* Realistic iPhone Smartphone Casing */}
                    <div className="relative w-[220px] rounded-[34px] bg-[#0E1524] p-[5px] shadow-[0_20px_50px_rgba(0,0,0,0.85)] border-2 border-[#54627A] ring-1 ring-white/20">
                      
                      {/* Phone Speaker & Dynamic Notch Slit */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-black rounded-full z-30 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#182338] border border-white/10" />
                      </div>

                      {/* Phone Screen Display */}
                      <div className="w-full bg-[#0a0e17] rounded-[28px] overflow-hidden border border-white/10 flex flex-col">
                        
                        {/* Status bar */}
                        <div className="h-5 px-3 pt-1 flex items-center justify-between text-[8px] text-gray-400">
                          <span className="font-bold">9:41</span>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-1.5 bg-gray-400 rounded-xs"></span>
                            <span className="w-2 h-1.5 bg-gray-400 rounded-xs"></span>
                            <span className="w-3 h-1.5 border border-gray-400 rounded-xs"></span>
                          </div>
                        </div>

                        {/* In-app Mini Header */}
                        <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between bg-[#111726]">
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[8px] font-bold">
                              GN
                            </div>
                            <span className="text-[10px] font-black text-white tracking-tight">GLOBAL NEWS</span>
                          </div>
                          <div className="space-y-0.5">
                            <div className="w-3 h-0.5 bg-white rounded-full"></div>
                            <div className="w-3 h-0.5 bg-white rounded-full"></div>
                          </div>
                        </div>

                        {/* Breaking News Card inside Phone */}
                        <div className="p-2 space-y-1.5">
                          <div className="inline-block px-1.5 py-0.5 bg-red-600 text-white text-[7px] font-black uppercase rounded-sm">
                            {config.breakingTag}
                          </div>
                          
                          <h5 className="text-[9px] font-black text-white leading-tight line-clamp-2">
                            {config.breakingHeadline}
                          </h5>

                          {/* City Skyline Image inside phone */}
                          <div className="relative h-16 w-full rounded-lg overflow-hidden bg-gradient-to-t from-black to-slate-800">
                            <img
                              src="https://images.unsplash.com/photo-1577717903315-1691ae25ab3f?auto=format&fit=crop&w=400&q=80"
                              alt="Skyline"
                              className="w-full h-full object-cover opacity-85"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          </div>

                          {/* TOP STORIES inside phone */}
                          <div className="pt-1 space-y-1">
                            <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider block">
                              TOP STORIES
                            </span>

                            {config.topStories.slice(0, 3).map((story, i) => (
                              <div key={i} className="flex items-center gap-1.5 p-1 bg-white/5 rounded-md border border-white/5">
                                <div className="w-4 h-4 rounded bg-slate-700 flex-shrink-0 overflow-hidden">
                                  <img 
                                    src={
                                      i === 0 
                                        ? "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=100&q=70"
                                        : i === 1
                                        ? "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=100&q=70"
                                        : "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=100&q=70"
                                    } 
                                    alt="Thumb" 
                                    className="w-full h-full object-cover" 
                                  />
                                </div>
                                <span className="text-[7.5px] font-medium text-gray-200 line-clamp-1 leading-none">
                                  {story}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                    </div>

                  </div>

                </div>

                {/* ========================================================
                    QR CODE CALL-TO-ACTION SECTION
                   ======================================================== */}
                <div className="relative z-10 px-8 pt-4 pb-2">
                  <div 
                    className="relative w-full rounded-2xl p-3 flex items-center justify-between shadow-xl border-2 border-[#D4A017]"
                    style={{
                      background: 'linear-gradient(135deg, #F9D423 0%, #FFB300 50%, #E69500 100%)',
                    }}
                  >
                    {/* Left: Genuine Scannable QR Code */}
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-1 rounded-xl shadow-md border-2 border-black/10 flex-shrink-0">
                        {qrCodeDataUrl ? (
                          <img
                            src={qrCodeDataUrl}
                            alt="Scan QR code to visit Global News"
                            className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
                            <QrIcon className="w-6 h-6 text-gray-500" />
                          </div>
                        )}
                      </div>

                      {/* Middle: SCAN ME! + VISIT NOW */}
                      <div>
                        <h3 className="text-2xl sm:text-3xl font-black text-[#0B1528] leading-none uppercase tracking-tight">
                          {config.scanCtaText}
                        </h3>
                        <div className="mt-1 inline-block px-3 py-1 bg-[#D31027] text-white text-xs font-black rounded-lg uppercase tracking-wider shadow-sm">
                          {config.visitCtaText}
                        </div>
                      </div>
                    </div>

                    {/* Right: Globe Pointer Cursor + URL */}
                    <div className="flex items-center gap-2 pr-2">
                      <div className="w-7 h-7 rounded-full bg-[#0C1E3C] flex items-center justify-center text-white shadow-sm">
                        <Globe className="w-4 h-4 text-[#FFCC00]" />
                      </div>
                      <span className="text-lg sm:text-xl font-black text-[#0C1E3C] tracking-tight">
                        {config.domainDisplay}
                      </span>
                    </div>

                  </div>
                </div>

                {/* ========================================================
                    BOTTOM COMMUNITY CARD (White Rounded Container)
                   ======================================================== */}
                <div className="relative z-10 px-8 pt-2">
                  <div className="bg-white rounded-2xl p-3 text-center text-[#0B1528] shadow-2xl">
                    <h4 className="text-xs sm:text-sm font-black tracking-wider uppercase text-[#0B1528]">
                      JOIN THE GLOBAL NEWS COMMUNITY
                    </h4>

                    {/* 4 Pillars: READ, SHARE, ENGAGE, GROW */}
                    <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-gray-100">
                      
                      {/* READ */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#0C1E3C] flex items-center justify-center text-white shadow-sm">
                          <Newspaper className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black text-[#0C1E3C] mt-1 uppercase">READ</span>
                        <p className="text-[8px] text-gray-600 font-medium leading-tight">Quality news anytime.</p>
                      </div>

                      {/* SHARE */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#0C1E3C] flex items-center justify-center text-white shadow-sm">
                          <Share2 className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black text-[#0C1E3C] mt-1 uppercase">SHARE</span>
                        <p className="text-[8px] text-gray-600 font-medium leading-tight">Spread the news that matters.</p>
                      </div>

                      {/* ENGAGE */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#0C1E3C] flex items-center justify-center text-white shadow-sm">
                          <MessageSquare className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black text-[#0C1E3C] mt-1 uppercase">ENGAGE</span>
                        <p className="text-[8px] text-gray-600 font-medium leading-tight">Your opinion counts.</p>
                      </div>

                      {/* GROW */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#0C1E3C] flex items-center justify-center text-white shadow-sm">
                          <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black text-[#0C1E3C] mt-1 uppercase">GROW</span>
                        <p className="text-[8px] text-gray-600 font-medium leading-tight">Grow with us from day one.</p>
                      </div>

                    </div>
                  </div>
                </div>

                {/* ========================================================
                    BOTTOM FOOTER STRIP: Red Banner
                   ======================================================== */}
                <div className="relative z-10 mt-3 py-2.5 px-6 bg-[#D31027] text-white text-center shadow-lg">
                  <p className="text-xs sm:text-sm font-black tracking-wide uppercase">
                    VISIT TODAY: <span className="underline decoration-white/40">{config.domainDisplay}</span>
                  </p>
                </div>

              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

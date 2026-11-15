import React, { useState, useEffect } from 'react';
import { MoreVertical, MoreHorizontal, ExternalLink, Share2, X, Tv, Radio, Play, Flame } from 'lucide-react';

export default function LiveBroadcasts() {
  const [isOpen, setIsOpen] = useState(false);

  const broadcasts = [
    {
      id: "al-jazeera",
      title: "Al Jazeera English Live",
      type: "youtube",
      embedId: "gCNeDWCI0vo",
      channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg",
      tag: "Global News",
      watchUrl: "https://www.youtube.com/watch?v=gCNeDWCI0vo"
    },
    {
      id: "abc-news",
      title: "ABC News USA 24/7",
      type: "youtube",
      embedId: "iiR8B1B6Vf8",
      channelId: "UCBi2mrWuNuyYy4gbM6fU18Q",
      tag: "US / Global",
      watchUrl: "https://www.youtube.com/watch?v=iiR8B1B6Vf8"
    },
    {
      id: "dw-news",
      title: "DW News 24/7 Live",
      type: "youtube",
      embedId: "GE_S3nCSKAA",
      channelId: "UCknLrEdhRCp1aegoMqRaCZg",
      tag: "Europe / Global",
      watchUrl: "https://www.youtube.com/watch?v=GE_S3nCSKAA"
    },
    {
      id: "france-24",
      title: "France 24 English Live",
      type: "youtube",
      embedId: "lK-r_gQ5C04",
      channelId: "UCQfwfsi5VrQ8yKZ-UWmAEFg",
      tag: "International News",
      watchUrl: "https://www.youtube.com/watch?v=lK-r_gQ5C04"
    },
    {
      id: "nasa-live",
      title: "NASA TV HD Live Stream",
      type: "youtube",
      embedId: "21X5lGlDOfg",
      channelId: "UCLA_DiR1FfKNvjuUpBHmylQ",
      tag: "Space & Science",
      watchUrl: "https://www.youtube.com/watch?v=21X5lGlDOfg"
    },
    {
      id: "sky-news",
      title: "Sky News UK 24/7",
      type: "youtube",
      embedId: "9Auq9mYxFEE",
      channelId: "UCoMdktPbSTixAyNGwb-PUkQ",
      tag: "UK / World",
      watchUrl: "https://www.youtube.com/watch?v=9Auq9mYxFEE"
    },
    {
      id: "cna-live",
      title: "CNA 24/7 News Live",
      type: "youtube",
      embedId: "XWq5kBlakcQ",
      channelId: "UC83jt4dlz1Gjl58fzQrgKKg",
      tag: "Asia / World",
      watchUrl: "https://www.youtube.com/watch?v=XWq5kBlakcQ"
    },
    {
      id: "euronews-live",
      title: "EuroNews English 24/7",
      type: "youtube",
      embedId: "pykpO5kQJ98",
      channelId: "UCSrZ3ac4P7OIHQ87wMImOuQ",
      tag: "European News",
      watchUrl: "https://www.youtube.com/watch?v=pykpO5kQJ98"
    },
    {
      id: "lofi-girl",
      title: "Lofi Girl 24/7 Radio",
      type: "youtube",
      embedId: "jfKfPfyJRdk",
      channelId: "UCSJ4gkVC6NrvII8umztf0Ow",
      tag: "Music & Focus",
      watchUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk"
    }
  ];

  const [selectedBroadcast, setSelectedBroadcast] = useState(broadcasts[0]);

  useEffect(() => {
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('open-live-broadcasts', handleOpenEvent);
    return () => window.removeEventListener('open-live-broadcasts', handleOpenEvent);
  }, []);

  const getEmbedUrl = (b: any) => {
    if (b.type === 'youtube') {
      if (b.embedId) {
        return `https://www.youtube.com/embed/${b.embedId}?autoplay=1&mute=0&rel=0&enablejsapi=1`;
      }
      return `https://www.youtube.com/embed/live_stream?channel=${b.channelId}&autoplay=1&mute=0`;
    }
    return '';
  };

  return (
    <>
      {/* Whole Live Broadcasts Drawer inside 3-Dot Menu */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md bg-[#0e0e0e] border-l border-white/10 h-full flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#141414]">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">
                    24/7 Live Broadcasts
                  </h3>
                  <p className="text-xs text-gray-400">
                    Streaming global news networks
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Close Drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Main Active Live Player */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  <span>Now Playing</span>
                  <span className="text-red-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    LIVE STREAM
                  </span>
                </div>
                <div className="aspect-video relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                  <iframe 
                    src={getEmbedUrl(selectedBroadcast)}
                    title={selectedBroadcast.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  ></iframe>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <h4 className="text-white font-bold text-sm">
                      {selectedBroadcast.title}
                    </h4>
                    <span className="text-xs text-gray-400">
                      {selectedBroadcast.tag}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => window.open(selectedBroadcast.watchUrl || `https://www.youtube.com/channel/${selectedBroadcast.channelId}/live`, '_blank')}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-xs font-semibold text-red-400 hover:text-red-300 transition-all flex items-center gap-1.5 shadow-sm"
                      title="Watch direct live stream on YouTube if blocked"
                    >
                      <span>Direct Live Feed</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Channels List */}
              <div className="space-y-3">
                <h4 className="text-white font-bold text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Tv className="w-4 h-4 text-red-500" />
                    <span>Available Live Networks</span>
                  </span>
                  <span className="text-xs text-gray-400 font-normal">9 Channels</span>
                </h4>
                <div className="space-y-2">
                  {broadcasts.map((b) => (
                    <div 
                      key={b.id} 
                      onClick={() => setSelectedBroadcast(b)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                        selectedBroadcast.id === b.id 
                          ? 'bg-blue-600/15 border-blue-500/50 text-white' 
                          : 'bg-[#181818] border-white/5 hover:border-white/15 text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center shrink-0 border border-white/10">
                          <span className={`w-2 h-2 rounded-full ${selectedBroadcast.id === b.id ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{b.title}</div>
                          <div className="text-[11px] text-gray-400">{b.tag}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(b.watchUrl || `https://www.youtube.com/channel/${b.channelId}/live`, '_blank');
                          }}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-medium text-gray-400 hover:text-white transition-colors"
                          title="Open Direct Live Link"
                        >
                          Direct link
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trending Topics */}
              <div className="pt-4 border-t border-white/10">
                <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>Trending Topics</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {['#WorldNews', '#Economy', '#Technology', '#Space', '#Climate', '#Markets', '#Geopolitics'].map((topic, i) => (
                    <span 
                      key={i} 
                      className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-gray-300 cursor-pointer hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


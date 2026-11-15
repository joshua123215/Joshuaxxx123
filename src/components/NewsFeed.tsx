import React, { useState } from "react";
import { Loader2, RefreshCw, MoreVertical, Bookmark, Clock, Share2, MoreHorizontal, Image as ImageIcon, FileText } from "lucide-react";
import CategoryNav from "./CategoryNav";
import HeroStory from "./HeroStory";
import { downloadNativeImage, downloadNativePDF } from "../utils/download";

interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  summary: string;
  likes: number;
  comments: number;
  image?: string;
  isTopStory?: boolean;
  link?: string;
}

interface NewsFeedProps {
  newsItems: NewsItem[];
  isLoading: boolean;
  hasError?: boolean;
  onArticleClick: (article: NewsItem) => void;
  onRefresh: () => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function NewsFeed({ newsItems, isLoading, hasError, onArticleClick, onRefresh, activeCategory, onCategoryChange }: NewsFeedProps) {
  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diff === 0) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const filteredNews = newsItems;

  const heroStory = filteredNews.length > 0 ? filteredNews[0] : null;
  const latestNews = filteredNews.length > 1 ? filteredNews.slice(1) : [];

  return (
    <div className="w-full pb-10">
      <CategoryNav activeCategory={activeCategory} onSelectCategory={onCategoryChange} />
      
      <div className="p-4 max-w-7xl mx-auto mt-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-white tracking-tight">{activeCategory}</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { window.dispatchEvent(new Event('open-live-broadcasts')); }}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-[#1a1a1a] border border-red-500/30 hover:border-red-500 text-xs font-bold text-red-400 hover:text-red-300 transition-all shadow-lg"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span>LIVE TV</span>
            </button>
            <button
              onClick={onRefresh}
              className="p-2.5 bg-[#1a1a1a] rounded-full border border-white/10 hover:border-white/30 text-gray-400 hover:text-white transition-all shadow-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin text-blue-500" : ""}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-gray-400 font-medium">Fetching latest {activeCategory.toLowerCase()}...</p>
          </div>
        ) : hasError ? (
          <div className="text-center py-20 bg-[#1a1a1a] rounded-3xl border border-white/5">
            <p className="text-gray-400 text-lg">Unable to load stories</p>
            <button onClick={onRefresh} className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">Try Again</button>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-center py-20 bg-[#1a1a1a] rounded-3xl border border-white/5">
            <p className="text-gray-400 text-lg">No stories available in this category right now.</p>
            <button onClick={onRefresh} className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors border border-white/10">Refresh</button>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Hero Section */}
            {heroStory && <HeroStory story={heroStory} onClick={onArticleClick} />}

            {/* Live TV Banner (only on Top Stories) */}
            {activeCategory === "Top Stories" && (
              <div className="bg-gradient-to-r from-[#1a1a1a] to-[#2a1a1a] rounded-3xl p-6 border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between shadow-lg gap-6">
                <div className="flex items-start sm:items-center gap-5">
                  <span className="w-3 h-3 mt-2 sm:mt-0 rounded-full bg-red-500 animate-pulse flex-shrink-0"></span>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3 mb-1">
                      <span>Live News Broadcasts</span>
                      <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] uppercase font-bold rounded shadow-md">24/7 LIVE</span>
                    </h2>
                    <p className="text-sm text-gray-400">Sky News, Al Jazeera, Red Bull & more streaming now</p>
                  </div>
                </div>
                <button
                  onClick={() => { window.dispatchEvent(new Event('open-live-broadcasts')); }}
                  className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
                >
                  <span>Watch Live</span>
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Latest News Grid */}
            <div>
              <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">Latest News</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {latestNews.map((item) => (
                  <article 
                    key={item.id}
                    onClick={() => onArticleClick(item)}
                    className="bg-[#1a1a1a] rounded-3xl overflow-hidden shadow-lg border border-white/5 hover:border-white/20 transition-all duration-300 cursor-pointer flex flex-col group h-full"
                  >
                    <div className="relative h-56 overflow-hidden bg-gradient-to-br from-gray-800 to-[#0a0a0a]">
                      {(item.image || item.link) ? (
                        <img
                          src={item.image || `/api/og-image?url=${encodeURIComponent(item.link || "")}`}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <svg className="w-16 h-16 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                        </div>
                      )}
                      <div className="absolute top-4 left-4">
                        <span className="px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {item.source}
                        </span>
                      </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-gray-400 text-xs mb-3 font-medium">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <time>{formatTime(item.time)}</time>
                        <span className="w-1 h-1 bg-gray-600 rounded-full mx-1"></span>
                        <span>3 min read</span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-4 leading-snug group-hover:text-blue-400 transition-colors line-clamp-3">
                        {item.title}
                      </h3>
                      <div className="mt-auto pt-5 border-t border-white/5 flex items-center justify-between">
                        <div className="flex gap-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); }}
                            className="text-gray-500 hover:text-white transition-colors"
                          >
                            <Share2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); }}
                            className="text-gray-500 hover:text-white transition-colors"
                          >
                            <Bookmark className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadNativeImage({
                                imageUrl: item.image || "",
                                source: item.source,
                                time: item.time,
                                title: item.title,
                                snippet: item.summary
                              }, `news-${item.id}`);
                            }}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            title="Download Image"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadNativePDF({
                                imageUrl: item.image || "",
                                source: item.source,
                                time: item.time,
                                title: item.title,
                                snippet: item.summary
                              }, `news-${item.id}`);
                            }}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            title="Download PDF"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

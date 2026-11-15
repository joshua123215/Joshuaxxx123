import React from 'react';
import { Clock } from 'lucide-react';

interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  summary: string;
  image?: string;
  link?: string;
}

interface HeroStoryProps {
  story: NewsItem;
  onClick: (story: NewsItem) => void;
}

export default function HeroStory({ story, onClick }: HeroStoryProps) {
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
  if (!story) return null;
  
  return (
    <article 
      onClick={() => onClick(story)}
      className="relative w-full h-[500px] sm:h-[600px] rounded-3xl overflow-hidden cursor-pointer group mb-8 shadow-2xl"
    >
      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500 z-10" />
      {(story.image || story.link) ? (
        <img 
          src={story.image || `/api/og-image?url=${encodeURIComponent(story.link || "")}`} 
          alt={story.title}
          className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-800 to-[#0a0a0a] flex items-center justify-center transform group-hover:scale-105 transition-transform duration-700">
          <svg className="w-24 h-24 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20" />
      
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 z-30">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">
            {story.source}
          </span>
          <div className="flex items-center gap-1.5 text-gray-300 text-sm">
            <Clock className="w-4 h-4" />
            <time>{formatTime(story.time)}</time>
          </div>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-tight group-hover:text-blue-400 transition-colors">
          {story.title}
        </h2>
        <p className="text-gray-300 text-base sm:text-lg mb-6 line-clamp-2 max-w-3xl">
          {story.summary}
        </p>
        <button className="px-6 py-2.5 bg-white text-black font-semibold rounded-full hover:bg-gray-200 transition-colors">
          Read Story
        </button>
      </div>
    </article>
  );
}

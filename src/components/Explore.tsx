import React from 'react';
import { TrendingUp, Clock, ArrowRight } from 'lucide-react';

interface ExploreProps {
  onArticleClick: (article: any) => void;
  trendingNews: any[];
}

export default function Explore({ onArticleClick, trendingNews }: ExploreProps) {
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-8 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-500" /> Explore
          </h2>
          <p className="text-gray-400 text-sm mt-1">Discover trending topics and ad-free movies</p>
        </div>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'movies' }))}
          className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 border border-blue-500/30 text-blue-400 hover:text-blue-300 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h2v4H8v-4zm6 0h2v4h-2v-4z"></path></svg>
          Movies Area
        </button>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" /> Trending Topics
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'movies' }))}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-full text-sm font-medium text-blue-300 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h2v4H8v-4zm6 0h2v4h-2v-4z"></path></svg>
              Ad-Free Movies
            </button>
            {['Technology', 'Artificial Intelligence', 'Global Markets', 'Elections 2026', 'Climate Change', 'Sports', 'Entertainment'].map((topic) => (
              <button 
                key={topic}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: 'search' }));
                }}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 border border-white/5 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" /> Top Trending Stories
          </h2>
          <div className="grid gap-4">
            {trendingNews.slice(0, 5).map((item, index) => (
              <article 
                key={item.id}
                onClick={() => onArticleClick(item)}
                className="flex items-center gap-4 group cursor-pointer"
              >
                <span className="text-4xl font-black text-white/10 group-hover:text-blue-500/20 transition-colors w-12 text-right">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <div className="flex-1 py-3 border-b border-white/5 group-hover:border-white/20 transition-colors">
                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">{item.source}</span>
                  <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

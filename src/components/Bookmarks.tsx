import React, { useState, useEffect } from 'react';
import { Bookmark, Clock, Trash2, ArrowLeft } from 'lucide-react';
import { User } from 'firebase/auth';

interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  summary: string;
  image?: string;
  link?: string;
}

interface BookmarksProps {
  user: User | null;
  onBack?: () => void;
  onArticleClick: (story: NewsItem) => void;
}

export default function Bookmarks({ user, onBack, onArticleClick }: BookmarksProps) {
  const [bookmarks, setBookmarks] = useState<NewsItem[]>([]);

  useEffect(() => {
    // Load bookmarks from local storage
    const key = user ? `bookmarks_${user.uid}` : 'bookmarks_anonymous';
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setBookmarks(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing bookmarks', e);
      }
    }
  }, [user]);

  const removeBookmark = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const newBookmarks = bookmarks.filter(b => b.id !== id);
    setBookmarks(newBookmarks);
    const key = user ? `bookmarks_${user.uid}` : 'bookmarks_anonymous';
    localStorage.setItem(key, JSON.stringify(newBookmarks));
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        {onBack && (
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        )}
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-blue-500 fill-current" />
          Saved Articles
        </h1>
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-20 bg-[#1a1a1a] rounded-3xl border border-white/5">
          <Bookmark className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No saved articles yet</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            When you find a story you want to read later, click the bookmark icon and it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bookmarks.map(item => (
            <article 
              key={item.id}
              onClick={() => onArticleClick(item)}
              className="bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-lg border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex flex-col sm:flex-row"
            >
              <div className="w-full sm:w-1/3 h-48 sm:h-auto relative bg-gradient-to-br from-gray-800 to-[#0a0a0a]">
                {(item.image || item.link) ? (
                  <img 
                    src={item.image || `/api/og-image?url=${encodeURIComponent(item.link || "")}`} 
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                  </div>
                )}
              </div>
              <div className="p-4 sm:p-5 w-full sm:w-2/3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">{item.source}</span>
                  <button 
                    onClick={(e) => removeBookmark(e, item.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors"
                    title="Remove from saved"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 leading-tight line-clamp-2 hover:text-blue-400">
                  {item.title}
                </h3>
                <div className="mt-auto flex items-center gap-2 text-gray-500 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <time>{item.time}</time>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

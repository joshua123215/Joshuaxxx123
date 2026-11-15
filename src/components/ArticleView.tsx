import React, { useState, useEffect } from 'react';
import { 
  Clock, Share2, Bookmark, ArrowLeft, Image as ImageIcon, 
  FileText, ShieldCheck 
} from 'lucide-react';
import { downloadNativeImage, downloadNativePDF } from '../utils/download';
import { isAdminUser } from '../utils/subscription';

interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  summary: string;
  image?: string;
  link?: string;
}

interface ArticleViewProps {
  article: NewsItem;
  onBack: () => void;
  user: any;
  onOpenAuth?: () => void;
}

export default function ArticleView({ 
  article, 
  onBack, 
  user,
}: ArticleViewProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const isAdmin = isAdminUser(user);

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

  useEffect(() => {
    const key = user ? `bookmarks_${user.uid}` : 'bookmarks_anonymous';
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const bookmarks: NewsItem[] = JSON.parse(stored);
        setIsBookmarked(bookmarks.some(b => b.id === article.id));
      } catch (e) {
        console.error(e);
      }
    }
  }, [article.id, user]);

  const toggleBookmark = () => {
    const key = user ? `bookmarks_${user.uid}` : 'bookmarks_anonymous';
    const stored = localStorage.getItem(key);
    let bookmarks: NewsItem[] = [];
    if (stored) {
      try { bookmarks = JSON.parse(stored); } catch (e) {}
    }
    
    if (isBookmarked) {
      bookmarks = bookmarks.filter(b => b.id !== article.id);
    } else {
      bookmarks.push(article);
    }
    
    localStorage.setItem(key, JSON.stringify(bookmarks));
    setIsBookmarked(!isBookmarked);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: article.link || window.location.href,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      navigator.clipboard.writeText(article.link || window.location.href);
      alert('Link copied to clipboard');
    }
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen pb-24">
      {/* Article Header & Image */}
      <div className="relative w-full h-[400px] sm:h-[500px]">
        {(article.image || article.link) ? (
          <img 
            src={article.image || `/api/og-image?url=${encodeURIComponent(article.link || "")}`} 
            alt={article.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-[#0a0a0a] flex items-center justify-center">
             <svg className="w-24 h-24 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
        
        <button 
          onClick={onBack}
          className="absolute top-6 left-4 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-colors text-white"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        {/* Admin Badge */}
        {isAdmin && (
          <div className="absolute top-6 right-4 px-3 py-1 bg-purple-500/80 backdrop-blur-md border border-purple-400/40 text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-yellow-300" />
            <span>Admin</span>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-32 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">
            {article.source}
          </span>
          <div className="flex items-center gap-1.5 text-gray-300 text-sm font-medium">
            <Clock className="w-4 h-4" />
            <time>{formatTime(article.time)}</time>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
          {article.title}
        </h1>

        <div className="flex items-center justify-between py-4 border-y border-white/10 mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-sm font-medium text-white"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button 
              onClick={toggleBookmark}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium ${isBookmarked ? 'bg-blue-600 text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} /> 
              {isBookmarked ? 'Saved' : 'Save'}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                downloadNativeImage({
                  imageUrl: article.image || "",
                  source: article.source,
                  time: article.time,
                  title: article.title,
                  snippet: article.summary
                }, `news-${article.id}`);
              }}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title="Download as HD Image (PNG)"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                downloadNativePDF({
                  imageUrl: article.image || "",
                  source: article.source,
                  time: article.time,
                  title: article.title,
                  snippet: article.summary
                }, `news-${article.id}`);
              }}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title="Download as Document (PDF)"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Article Body */}
        <div className="prose prose-invert prose-lg max-w-none">
          <p className="text-gray-300 leading-relaxed text-xl mb-8">
            {article.summary}
          </p>
            {/* Full Article Link Box */}
            <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-white/5 text-center mt-12 shadow-lg">
              <h3 className="text-lg font-bold text-white mb-2">Want to read the full story?</h3>
              <p className="text-gray-400 mb-6">
                This is a summary provided by GlobalNews. Read the complete article on the original source website.
              </p>
              {article.link ? (
                <a 
                  href={article.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                >
                  Read Full Article on {article.source}
                </a>
              ) : (
                <p className="text-red-400">Full article link not available.</p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

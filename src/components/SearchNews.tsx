import React, { useState, useEffect } from 'react';
import { Search, Loader2, Clock } from 'lucide-react';
import axios from 'axios';

export default function SearchNews({ onArticleClick }: { onArticleClick: (article: any) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setHasSearched(true);
    setQuery(searchQuery);
    try {
      const res = await axios.get(`/api/search-news?q=${encodeURIComponent(searchQuery)}`);
      const formatted = res.data.map((item: any) => ({
        ...item,
        image: item.image || `https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800`
      }));
      setResults(formatted);
      
      const newRecent = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
      setRecentSearches(newRecent);
      localStorage.setItem('recentSearches', JSON.stringify(newRecent));
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 60) return `${diff} min ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-24">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search news, topics, or keywords..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(query); }}
          className="block w-full pl-12 pr-4 py-4 border border-white/10 rounded-2xl leading-5 bg-[#1a1a1a] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg transition-all shadow-lg"
        />
        <button 
          onClick={() => handleSearch(query)}
          className="absolute right-2 top-2 bottom-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors"
        >
          Search
        </button>
      </div>

      {!hasSearched && recentSearches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-gray-400 font-medium text-sm px-2">Recent Searches</h3>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map(term => (
              <button 
                key={term}
                onClick={() => { setQuery(term); handleSearch(term); }}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 border border-white/5 rounded-full text-sm font-medium text-gray-300 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-gray-400">Searching...</p>
        </div>
      ) : hasSearched ? (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-4">Results for "{query}"</h2>
          {results.length === 0 ? (
            <div className="text-center py-16 bg-[#1a1a1a] rounded-3xl border border-white/5">
              <p className="text-gray-400 text-lg mb-2">No results found.</p>
              <p className="text-gray-500 text-sm">Try searching for different keywords.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {results.map((item, i) => (
                <article 
                  key={i}
                  onClick={() => onArticleClick(item)}
                  className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5 hover:border-white/20 transition-all cursor-pointer flex gap-4"
                >
                  {(item.image || item.link) && (
                    <img src={item.image || `/api/og-image?url=${encodeURIComponent(item.link || "")}`} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
                  )}
                  <div className="flex flex-col justify-between py-1">
                    <span className="text-xs font-bold text-blue-500 uppercase">{item.source}</span>
                    <h3 className="text-white font-bold line-clamp-2 hover:text-blue-400">{item.title}</h3>
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                      <Clock className="w-3 h-3" /> {formatTime(item.time)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const fs = require('fs');

let newsFeedCode = fs.readFileSync('src/components/NewsFeed.tsx', 'utf8');

// Add hasError prop to NewsFeedProps
newsFeedCode = newsFeedCode.replace(/isLoading: boolean;/, 'isLoading: boolean;\n  hasError?: boolean;');
newsFeedCode = newsFeedCode.replace(/isLoading, onArticleClick/, 'isLoading, hasError, onArticleClick');

// Replace the loading/empty states
const badStateBlock = `        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-gray-400 font-medium">Fetching latest {activeCategory.toLowerCase()}...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-center py-20 bg-[#1a1a1a] rounded-3xl border border-white/5">
            <p className="text-gray-400 text-lg">No news found for {activeCategory}.</p>
            <button onClick={onRefresh} className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">Retry</button>
          </div>
        ) : (`;

const newStateBlock = `        {isLoading ? (
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
        ) : (`;

newsFeedCode = newsFeedCode.replace(badStateBlock, newStateBlock);
fs.writeFileSync('src/components/NewsFeed.tsx', newsFeedCode);

// App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// Add states
appCode = appCode.replace(/const \[activeCategory, setActiveCategory\] = useState/, `const [cachedNews, setCachedNews] = useState<Record<string, any[]>>({});\n  const [newsError, setNewsError] = useState(false);\n  const [isFetchingCategory, setIsFetchingCategory] = useState<string | null>(null);\n  const [activeCategory, setActiveCategory] = useState`);

// Replace fetchRealtimeNews function entirely
const oldFetchFuncRegex = /const fetchRealtimeNews = async[\s\S]*?setIsLoadingNews\(false\);\s*\}\s*\};/;

const newFetchFunc = `const fetchRealtimeNews = async (category: string = "Top Stories", forceRefresh = false) => {
    if (!forceRefresh && cachedNews[category] && cachedNews[category].length > 0) {
        setNewsItems(cachedNews[category]);
        setIsLoadingNews(false);
        setNewsError(false);
        return;
    }
    if (isFetchingCategory === category) return; // prevent duplicate fetch

    setIsFetchingCategory(category);
    setIsLoadingNews(true); 
    if(!forceRefresh) setNewsItems([]);
    setNewsError(false);
    
    try {
      const res = await axios.get(\`/api/news?category=\$\{encodeURIComponent(category)\}&t=\$\{Date.now()\}\`, { timeout: 15000 });
      const formattedData = res.data.map((item: any) => ({
        ...item,
        image: item.image || \`https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800\`,
      }));
      setNewsItems(formattedData);
      setCachedNews(prev => ({ ...prev, [category]: formattedData }));
      if (formattedData.length === 0) setNewsError(true); // If API returns empty, maybe still set error if we expect something? Wait, no. Empty array is fine.
    } catch (error) {
      console.error("Error fetching news:", error);
      setNewsError(true);
      setNewsItems([]);
    } finally {
      setIsLoadingNews(false);
      setIsFetchingCategory(null);
    }
  };`;

appCode = appCode.replace(oldFetchFuncRegex, newFetchFunc);

// Update all occurrences of NewsFeed component in App.tsx to pass hasError
appCode = appCode.replace(/<NewsFeed\s+newsItems=\{newsItems\}\s+isLoading=\{isLoadingNews\}/g, `<NewsFeed newsItems={newsItems} isLoading={isLoadingNews} hasError={newsError}`);

// In renderContent, the onRefresh needs to pass true for forceRefresh
appCode = appCode.replace(/onRefresh=\{\(\) => fetchRealtimeNews\(activeCategory\)\}/g, `onRefresh={() => fetchRealtimeNews(activeCategory, true)}`);

fs.writeFileSync('src/App.tsx', appCode);


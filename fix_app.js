const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const fetchRealtimeNews = async \(\) => {/g, 'const fetchRealtimeNews = async (category: string = "Top Stories") => {');
code = code.replace(/await axios\.get\("\/api\/news"\)/g, 'await axios.get(`/api/news?category=${encodeURIComponent(category)}`)');

// Add activeCategory state
code = code.replace(/const \[selectedArticle, setSelectedArticle\] = useState<any>\(null\);/, `const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState("Top Stories");`);
  
// Pass activeCategory and onCategoryChange
code = code.replace(/<NewsFeed newsItems={newsItems} isLoading={isLoadingNews} onArticleClick={handleArticleClick} onRefresh={fetchRealtimeNews} \/>/g, `<NewsFeed newsItems={newsItems} isLoading={isLoadingNews} onArticleClick={handleArticleClick} onRefresh={() => fetchRealtimeNews(activeCategory)} activeCategory={activeCategory} onCategoryChange={(cat) => { setActiveCategory(cat); fetchRealtimeNews(cat); }} />`);

fs.writeFileSync('src/App.tsx', code);

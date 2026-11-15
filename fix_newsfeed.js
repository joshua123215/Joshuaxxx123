const fs = require('fs');
let code = fs.readFileSync('src/components/NewsFeed.tsx', 'utf8');

// Replace NewsFeedProps
code = code.replace(/interface NewsFeedProps \{[\s\S]*?\}/, `interface NewsFeedProps {
  newsItems: NewsItem[];
  isLoading: boolean;
  onArticleClick: (article: NewsItem) => void;
  onRefresh: () => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}`);

// Replace component signature and state
code = code.replace(/export default function NewsFeed\(\{ newsItems, isLoading, onArticleClick, onRefresh \}: NewsFeedProps\) \{[\s\S]*?const filteredNews = newsItems\.filter\(item => \{[\s\S]*?\}\);/m, `export default function NewsFeed({ newsItems, isLoading, onArticleClick, onRefresh, activeCategory, onCategoryChange }: NewsFeedProps) {
  const filteredNews = newsItems;`);

// Replace <CategoryNav /> call
code = code.replace(/<CategoryNav activeCategory=\{activeCategory\} onSelectCategory=\{setActiveCategory\} \/>/g, `<CategoryNav activeCategory={activeCategory} onSelectCategory={onCategoryChange} />`);

fs.writeFileSync('src/components/NewsFeed.tsx', code);

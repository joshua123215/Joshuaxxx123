const fs = require('fs');

function restoreNewsFeed() {
  let code = fs.readFileSync('src/components/NewsFeed.tsx', 'utf8');
  
  const badPart = /export default function NewsFeed\(\{\s*const formatTime = \([\s\S]*?\}\;\s*newsItems, isLoading, onArticleClick, onRefresh, activeCategory, onCategoryChange \}\: NewsFeedProps\) \{/;
  
  const replacement = `export default function NewsFeed({ newsItems, isLoading, onArticleClick, onRefresh, activeCategory, onCategoryChange }: NewsFeedProps) {
  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 60) return \`\${diff} min ago\`;
    if (diff < 1440) return \`\${Math.floor(diff / 60)} hours ago\`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };`;
  
  code = code.replace(badPart, replacement);
  fs.writeFileSync('src/components/NewsFeed.tsx', code);
}

function restoreHeroStory() {
  let code = fs.readFileSync('src/components/HeroStory.tsx', 'utf8');
  
  const badPart = /export default function HeroStory\(\{\s*const formatTime = \([\s\S]*?\}\;\s*story, onClick \}\: HeroStoryProps\) \{/;
  
  const replacement = `export default function HeroStory({ story, onClick }: HeroStoryProps) {
  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 60) return \`\${diff} min ago\`;
    if (diff < 1440) return \`\${Math.floor(diff / 60)} hours ago\`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };`;
  
  code = code.replace(badPart, replacement);
  fs.writeFileSync('src/components/HeroStory.tsx', code);
}

restoreNewsFeed();
restoreHeroStory();


const fs = require('fs');

function fixFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  // Find where formatTime was incorrectly inserted
  const badInjection = /export default function (\w+)\(\{\n\s*const formatTime = \([\s\S]*?\}\;\n/m;
  const match = code.match(badInjection);
  if (match) {
    // We need to move formatTime inside the function body, after the parameters
    // Wait, the easiest way is to restore the signature from git or just fix it.
    // The signature was `export default function NewsFeed({ newsItems, isLoading, onArticleClick, onRefresh, activeCategory, onCategoryChange }: NewsFeedProps) {`
  }
}

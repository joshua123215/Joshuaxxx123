const fs = require('fs');
let code = fs.readFileSync('src/components/ArticleView.tsx', 'utf8');

const badPart = /export default function ArticleView\(\{\s*const formatTime = \([\s\S]*?\}\;\s*article, onBack, user \}\: ArticleViewProps\) \{/;

const replacement = `export default function ArticleView({ article, onBack, user }: ArticleViewProps) {
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
fs.writeFileSync('src/components/ArticleView.tsx', code);

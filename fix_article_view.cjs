const fs = require('fs');

let code = fs.readFileSync('src/components/ArticleView.tsx', 'utf8');

const imageRegex = /<img\s+src=\{article\.image\}(.*?)className="(.*?)"(.*?)>/;
const newImage = `<img 
            src={article.image} 
            alt={article.title} 
            loading="lazy"
            onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800'; }}
            className="$2 object-cover"
            $3
          />`;

code = code.replace(imageRegex, newImage);

// Better spacing for headline
code = code.replace(
  /<h1 className="text-3xl md:text-5xl font-black text-white mb-6 leading-tight tracking-tight">/,
  `<h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-6 mt-4 leading-tight tracking-tight">`
);

// Format date: "5 min ago", "Aug 24, 2026"
// Let's add a formatter in ArticleView
const formatter = `
  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 60) return \`\${diff} min ago\`;
    if (diff < 1440) return \`\${Math.floor(diff / 60)} hours ago\`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
`;

code = code.replace(/export default function ArticleView.*?\{/, '$&\n' + formatter);

code = code.replace(
  /<div className="text-gray-400">\{article\.time\}<\/div>/,
  `<div className="text-gray-400">{formatTime(article.time)} • 3 min read</div>`
);
// Also for mobile view of time (if any)
code = code.replace(
  /<span className="text-gray-400">\{article\.time\}<\/span>/g,
  `<span className="text-gray-400">{formatTime(article.time)} • 3 min read</span>`
);

fs.writeFileSync('src/components/ArticleView.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `const [activeCategory, setActiveCategory] = useState(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#category=')) {
      const cat = decodeURIComponent(hash.split('=')[1]);
      return cat;
    }
    return "Top Stories";
  });`;
  
code = code.replace(/const \[activeCategory, setActiveCategory\] = useState\("Top Stories"\);/, replacement);

code = code.replace(/onCategoryChange=\{\(cat\) => \{ setActiveCategory\(cat\); fetchRealtimeNews\(cat\); \}\}/g, `onCategoryChange={(cat) => { setActiveCategory(cat); window.location.hash = \`category=\${encodeURIComponent(cat)}\`; fetchRealtimeNews(cat); }}`);

fs.writeFileSync('src/App.tsx', code);

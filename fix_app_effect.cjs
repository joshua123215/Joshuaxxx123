const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/useEffect\(\(\) => \{\s*fetchRealtimeNews\(\);\s*\}, \[\]\);/g, `useEffect(() => {
    fetchRealtimeNews(activeCategory);
  }, []);`);

fs.writeFileSync('src/App.tsx', code);

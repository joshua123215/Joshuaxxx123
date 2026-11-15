const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const effectCode = `  useEffect(() => {
    const handleNavigate = (e: any) => setCurrentView(e.detail);
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);`;

code = code.replace(/useEffect\(\(\) => \{\s*fetchRealtimeNews\(activeCategory\);\s*\}, \[\]\);/, `useEffect(() => {
    fetchRealtimeNews(activeCategory);
  }, []);\n\n${effectCode}`);

fs.writeFileSync('src/App.tsx', code);

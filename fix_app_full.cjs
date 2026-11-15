const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add SearchNews import
const importSearch = `const SearchNews = React.lazy(() => import('./components/SearchNews'));\n`;
code = code.replace(/const Explore = React.lazy[^\n]*\n/, importSearch + '$&');

// Fix the renderContent switch
const oldSwitch = `      case 'explore':
        return <Explore onArticleClick={handleArticleClick} trendingNews={newsItems} />;
      case 'saved':`;

const newSwitch = `      case 'search':
        return <SearchNews onArticleClick={handleArticleClick} />;
      case 'explore':
        return <Explore onArticleClick={handleArticleClick} trendingNews={newsItems} />;
      case 'saved':`;

code = code.replace(oldSwitch, newSwitch);

// Cache-bust in fetchRealtimeNews
code = code.replace(
  /axios\.get\(\`\/api\/news\?category=\$\{encodeURIComponent\(category\)\}\`\);/,
  "axios.get(`/api/news?category=${encodeURIComponent(category)}&t=${Date.now()}`);"
);
code = code.replace(
  /setIsLoadingNews\(true\);/,
  "setIsLoadingNews(true); setNewsItems([]);"
);


// Replace Bottom Navigation entirely
const bottomNavRegex = /<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-\[#0a0a0a\]\/95 backdrop-blur-xl border-t border-white\/5 flex items-center justify-around p-2 pb-safe z-40">[\s\S]*?<\/div>/;

const newBottomNav = `<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around p-2 pb-safe z-40">
        <button 
          onClick={() => setCurrentView('news')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'news' || currentView === 'article' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Home className={\`w-6 h-6 \${currentView === 'news' || currentView === 'article' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button 
          onClick={() => setCurrentView('explore')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'explore' || currentView === 'movies' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Compass className={\`w-6 h-6 \${currentView === 'explore' || currentView === 'movies' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Explore</span>
        </button>
        <button 
          onClick={() => setCurrentView('search')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'search' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Search className={\`w-6 h-6 \${currentView === 'search' ? 'text-blue-500' : ''}\`} />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        <button 
          onClick={() => setCurrentView('saved')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'saved' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Bookmark className={\`w-6 h-6 \${currentView === 'saved' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Saved</span>
        </button>
        <button 
          onClick={() => setCurrentView('profile')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'profile' || currentView === 'adfree' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          {user && user.photoURL ? (
             <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-white/20" />
          ) : (
             <UserIcon className={\`w-6 h-6 \${currentView === 'profile' || currentView === 'adfree' ? 'fill-current' : ''}\`} />
          )}
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>`;

code = code.replace(bottomNavRegex, newBottomNav);

// Ensure Search is imported if not already from lucide-react (wait, App.tsx doesn't have Search, let's inject it)
code = code.replace(/import \{ ([^}]+) \} from 'lucide-react';/, "import { $1, Search } from 'lucide-react';");

fs.writeFileSync('src/App.tsx', code);

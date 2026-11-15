const fs = require('fs');
let code = fs.readFileSync('src/components/Explore.tsx', 'utf8');

const oldTopics = `          <div className="flex flex-wrap gap-2">
            {['Technology', 'Artificial Intelligence', 'Global Markets', 'Elections 2026', 'Climate Change', 'Sports', 'Entertainment'].map((topic) => (
              <button 
                key={topic}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: 'search' }));
                  // Wait, no easy way to pass state to SearchNews from here. But they can just go to search page.
                }}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 border border-white/5 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>`;

const newTopics = `          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'movies' }))}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-full text-sm font-medium text-blue-300 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h2v4H8v-4zm6 0h2v4h-2v-4z"></path></svg>
              Ad-Free Movies
            </button>
            {['Technology', 'Artificial Intelligence', 'Global Markets', 'Elections 2026', 'Climate Change', 'Sports', 'Entertainment'].map((topic) => (
              <button 
                key={topic}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: 'search' }));
                }}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-white/10 border border-white/5 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>`;

code = code.replace(oldTopics, newTopics);
fs.writeFileSync('src/components/Explore.tsx', code);

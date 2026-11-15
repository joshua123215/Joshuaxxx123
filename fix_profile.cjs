const fs = require('fs');

let code = fs.readFileSync('src/components/Profile.tsx', 'utf8');

// Replace standard links section with one that includes Ad-Free
const newLinks = `          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'adfree' }))}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <span className="font-medium text-gray-200">Ad-Free Movies</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            <button 
              onClick={onViewBookmarks}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Bookmark className="w-5 h-5 text-blue-500" />
                </div>
                <span className="font-medium text-gray-200">Saved Articles</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>`;
            
code = code.replace(/<div className="bg-\[#1a1a1a\] rounded-2xl border border-white\/5 overflow-hidden">\s*<button\s*onClick=\{onViewBookmarks\}[\s\S]*?<\/button>/, newLinks);

fs.writeFileSync('src/components/Profile.tsx', code);

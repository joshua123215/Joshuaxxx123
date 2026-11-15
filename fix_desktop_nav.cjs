const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalHeader.tsx', 'utf8');

const navCode = `        <div className="hidden lg:flex items-center gap-6">
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'news' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">News</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'explore' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Explore</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'movies' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Movies</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'adfree' }))} className="text-sm font-medium text-green-500 hover:text-green-400 transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Ad-Free
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'saved' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Saved</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profile' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Profile</button>
        </div>`;

code = code.replace(/<div className="flex items-center gap-3 cursor-pointer">/, `${navCode}\n        <div className="flex items-center gap-3 cursor-pointer">`);

// Wait, the order should be: Brand (left), Nav (center), Actions (right).
code = code.replace(/<div className="flex items-center gap-4">/, `${navCode}\n        <div className="flex items-center gap-4">`);
code = code.replace(`${navCode}\n        <div className="flex items-center gap-3 cursor-pointer">`, `<div className="flex items-center gap-3 cursor-pointer">`); // Revert first replace just in case

fs.writeFileSync('src/components/GlobalHeader.tsx', code);

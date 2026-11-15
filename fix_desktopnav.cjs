const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalHeader.tsx', 'utf8');

// Replace explore with explore, and add search?
// Wait, the desktop nav currently has News, Explore, Movies, Saved, Profile.
code = code.replace(
  /<button onClick=\{\(\) => window.dispatchEvent\(new CustomEvent\('navigate', \{ detail: 'explore' \}\)\)\}.*?Explore<\/button>/s,
  `<button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'explore' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Explore</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'search' }))} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Search</button>`
);

fs.writeFileSync('src/components/GlobalHeader.tsx', code);

const fs = require('fs');

let code = fs.readFileSync('src/components/NewsFeed.tsx', 'utf8');

code = code.replace(
  /<p className="text-gray-400 text-lg">No news found for \{activeCategory\}\.<\/p>/,
  `<p className="text-gray-400 text-lg">No news found for {activeCategory}.</p>\n            <button onClick={onRefresh} className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">Retry</button>`
);

fs.writeFileSync('src/components/NewsFeed.tsx', code);

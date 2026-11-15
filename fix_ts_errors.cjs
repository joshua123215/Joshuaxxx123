const fs = require('fs');

let server = fs.readFileSync('server.ts', 'utf8');
server = server.replace(
  `const targetUrl = req.query.url;`,
  `const targetUrl = req.query.url as string;`
);
fs.writeFileSync('server.ts', server);

const filesToFix = [
  'src/components/NewsFeed.tsx',
  'src/components/Bookmarks.tsx',
  'src/components/SearchNews.tsx',
  'src/components/ArticleView.tsx'
];

filesToFix.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(
    /encodeURIComponent\((item\.link)\)/g,
    'encodeURIComponent($1 || "")'
  );
  code = code.replace(
    /encodeURIComponent\((article\.link)\)/g,
    'encodeURIComponent($1 || "")'
  );
  fs.writeFileSync(file, code);
});

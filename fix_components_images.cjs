const fs = require('fs');

const filesToFix = [
  'src/components/NewsFeed.tsx',
  'src/components/Bookmarks.tsx',
  'src/components/SearchNews.tsx',
  'src/components/ArticleView.tsx'
];

filesToFix.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  
  if (file.includes('NewsFeed.tsx')) {
    code = code.replace(
      `src={item.image}`,
      `src={item.image || \`/api/og-image?url=\${encodeURIComponent(item.link)}\`}`
    );
  } else if (file.includes('Bookmarks.tsx')) {
    code = code.replace(
      `src={item.image}`,
      `src={item.image || \`/api/og-image?url=\${encodeURIComponent(item.link)}\`}`
    );
  } else if (file.includes('SearchNews.tsx')) {
    code = code.replace(
      `{item.image && (`,
      `{(item.image || item.link) && (`
    ).replace(
      `src={item.image}`,
      `src={item.image || \`/api/og-image?url=\${encodeURIComponent(item.link)}\`}`
    );
  } else if (file.includes('ArticleView.tsx')) {
    code = code.replace(
      `{article.image ? (`,
      `{(article.image || article.link) ? (`
    ).replace(
      `src={article.image}`,
      `src={article.image || \`/api/og-image?url=\${encodeURIComponent(article.link)}\`}`
    );
  }
  
  fs.writeFileSync(file, code);
});

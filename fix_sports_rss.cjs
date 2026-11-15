const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /{ url: 'https:\/\/news\.google\.com\/rss\/search\?q=Sports&hl=en-US&gl=US&ceid=US:en', source: 'Google News Sports' }/g,
  "{ url: 'https://www.espn.com/espn/rss/news', source: 'ESPN' }"
);

fs.writeFileSync('server.ts', code);

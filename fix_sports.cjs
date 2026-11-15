const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /"Sports": \[\s*\{\s*url: 'https:\/\/rss\.nytimes\.com\/services\/xml\/rss\/nyt\/Sports\.xml',\s*source: 'NY Times Sports'\s*\},[\s\S]*?\],/,
  `"Sports": [
    { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC Sports' },
    { url: 'https://sports.yahoo.com/rss/', source: 'Yahoo Sports' },
  ],`
);

fs.writeFileSync('server.ts', code);

const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /{ url: 'https:\/\/news\.google\.com\/rss\/search\?q=Ghana\+News&hl=en-US&gl=US&ceid=US:en', source: 'Google News Ghana' }/g,
  "{ url: 'https://allafrica.com/tools/headlines/rdf/ghana/headlines.rdf', source: 'AllAfrica Ghana' }"
);

fs.writeFileSync('server.ts', code);

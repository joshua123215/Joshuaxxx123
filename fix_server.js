const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `const CATEGORY_FEEDS: Record<string, { url: string; source: string }[]> = {
  "Top Stories": [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  ],
  "Ghana": [
    { url: 'https://news.google.com/rss/search?q=Ghana+News&hl=en-US&gl=US&ceid=US:en', source: 'Google News Ghana' }
  ],
  "World": [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NY Times' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  ],
  "Politics": [
    { url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', source: 'BBC Politics' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', source: 'NY Times Politics' },
  ],
  "Business": [
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NY Times Business' },
  ],
  "Technology": [
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', source: 'NY Times Tech' },
  ],
  "Sports": [
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml', source: 'NY Times Sports' },
    { url: 'https://news.google.com/rss/search?q=Sports&hl=en-US&gl=US&ceid=US:en', source: 'Google News Sports' },
  ],
  "Entertainment": [
    { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC Ent & Arts' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml', source: 'NY Times Arts' },
  ],
  "Health": [
    { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', source: 'BBC Health' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', source: 'NY Times Health' },
  ]
};`;

code = code.replace(/const RSS_FEEDS = \[\s*\{[\s\S]*?\];/, replacement);

code = code.replace(/app\.get\("\/api\/news", async \(req, res\) => {[\s\S]*?for \(const feedConfig of RSS_FEEDS\) {/, `app.get("/api/news", async (req, res) => {
  try {
    const category = (req.query.category as string) || "Top Stories";
    const feedsToFetch = CATEGORY_FEEDS[category] || CATEGORY_FEEDS["Top Stories"];
    let allItems: any[] = [];
    
    for (const feedConfig of feedsToFetch) {`);

fs.writeFileSync('server.ts', code);

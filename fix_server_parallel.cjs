const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Update BUSINESS FEEDS
code = code.replace(
/"Business": \[\s*\{\s*url: 'https:\/\/feeds\.bbci\.co\.uk\/news\/business\/rss\.xml', source: 'BBC Business' \},\s*\{\s*url: 'https:\/\/rss\.nytimes\.com\/services\/xml\/rss\/nyt\/Business\.xml', source: 'NY Times Business' \},\s*\],/,
`"Business": [
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
    { url: 'https://finance.yahoo.com/news/rss', source: 'Yahoo Finance' },
  ],`
);

// Rewrite /api/news deduplication and parallel fetching
const apiNewsRegex = /app\.get\("\/api\/news"[\s\S]*?res\.json\(finalItems\);[\s\S]*?\}\);/m;

const newApiNews = `app.get("/api/news", async (req, res) => {
  try {
    const category = (req.query.category) || "Top Stories";
    const feedsToFetch = CATEGORY_FEEDS[category] || CATEGORY_FEEDS["Top Stories"];
    
    const feedPromises = feedsToFetch.map(async (feedConfig) => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 5000));
        const feed = await Promise.race([parser.parseURL(feedConfig.url), timeoutPromise]);
        
        return feed.items.slice(0, 20).map((item) => {
          let imageUrl;
          if (item.media && item.media.$ && item.media.$.url) {
            imageUrl = item.media.$.url;
            imageUrl = imageUrl.replace('/standard/240/', '/standard/800/');
          } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            imageUrl = item.mediaContent.$.url;
          }
          return {
            source: feedConfig.source,
            time: item.pubDate ? new Date(item.pubDate).toLocaleString() : "RECENT",
            timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            title: item.title,
            summary: item.contentSnippet || item.content || "",
            likes: Math.floor(Math.random() * 500) + 10,
            comments: Math.floor(Math.random() * 100),
            image: imageUrl || null,
            link: item.link
          };
        });
      } catch (feedError) {
        console.error(\`Error fetching feed \${feedConfig.url}:\`, feedError.message);
        return [];
      }
    });

    const results = await Promise.all(feedPromises);
    let allItems = results.flat();

    // Sort by newest
    allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Deduplicate by URL or title
    const seen = new Set();
    const uniqueItems = [];
    for (const item of allItems) {
      const identifier = item.link || item.title;
      if (!seen.has(identifier)) {
        seen.add(identifier);
        uniqueItems.push(item);
      }
    }

    // Assign id and isTopStory
    const finalItems = uniqueItems.map((item, index) => ({
      ...item,
      id: index + 1,
      isTopStory: category === "Top Stories" ? index < 5 : index < 3
    }));

    res.json(finalItems);
  } catch (error) {
    console.error("RSS API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});`;

code = code.replace(apiNewsRegex, newApiNews);
fs.writeFileSync('server.ts', code);

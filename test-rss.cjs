const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    item: ['media:thumbnail', 'media:content', 'media:group', 'enclosure', 'content:encoded', 'image']
  }
});

(async () => {
  let feed = await parser.parseURL('https://feeds.bbci.co.uk/news/world/rss.xml');
  console.log(JSON.stringify(feed.items[1], null, 2));
})();

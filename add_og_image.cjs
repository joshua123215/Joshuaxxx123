const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const ogImageEndpoint = `
// Endpoint to fetch og:image for articles that don't provide an image in their RSS feed
app.get('/api/og-image', async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('Missing url');
    }
    
    const response = await fetch(targetUrl, {
       headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const html = await response.text();
    
    let ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    }
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    }
    if (!ogMatch) {
       ogMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    }
    
    if (ogMatch && ogMatch[1]) {
       let imgUrl = ogMatch[1];
       if (imgUrl.startsWith('/')) {
         const urlObj = new URL(targetUrl);
         imgUrl = urlObj.origin + imgUrl;
       }
       return res.redirect(imgUrl);
    }
    
    return res.status(404).send('No image found');
  } catch (error) {
    res.status(500).send('Error fetching og:image');
  }
});
`;

code = code.replace('app.get("/api/news", async (req, res) => {', ogImageEndpoint + '\napp.get("/api/news", async (req, res) => {');

fs.writeFileSync('server.ts', code);

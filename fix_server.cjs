const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// replace parseURL with timeout wrapper in /api/news and /api/search-news
const replacement = `const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 8000));
        const feed = await Promise.race([parser.parseURL(feedConfig.url), timeoutPromise]) as any;`;

code = code.replace(/const feed = await parser\.parseURL\(feedConfig\.url\);/g, replacement);

// Make sure that requestOptions in Parser config has a timeout
code = code.replace(/requestOptions: \{/, 'requestOptions: { timeout: 10000,');

fs.writeFileSync('server.ts', code);

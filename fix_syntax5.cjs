const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The issue is multiple replace runs created multiple `}});` strings or we failed to match them.
// Let's just find the `const PORT = 3000;` and replace whatever is right before it with `});`.
// Actually, let's just find the last occurrence of `app.get("/api/news"` and fix from there.
const portIndex = code.lastIndexOf('const PORT = 3000;');
const substring = code.substring(0, portIndex);
// Replace any trailing `  });\n  });\n  });\n` etc with just `});\n\n`
const cleaned = substring.replace(/(\s*\}\);\s*)+$/, '\n});\n\n');
code = cleaned + code.substring(portIndex);
fs.writeFileSync('server.ts', code);

const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// I will find EXACTLY `  });\n  });\n  });\nconst PORT`
code = code.replace(/\s*\}\);\s*\}\);\s*\}\);\nconst PORT = 3000;/, '\n});\n\nconst PORT = 3000;');
code = code.replace(/\s*\}\);\s*\}\);\nconst PORT = 3000;/, '\n});\n\nconst PORT = 3000;');

fs.writeFileSync('server.ts', code);

const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/  \}\);\n  \}\);\n\nconst PORT = 3000;/g, '});\n\nconst PORT = 3000;');
fs.writeFileSync('server.ts', code);

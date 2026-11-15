const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// The issue is my previous scripts didn't match. 
// I will just trim it explicitly.
const marker = '    res.status(500).json({ error: "Internal server error" });\n  }\n});';
const portCode = '\nconst PORT = 3000;\nViteExpress.listen(app, PORT, () => console.log(`Server is listening on port ${PORT}...`));';

code = code.substring(0, code.indexOf(marker) + marker.length) + portCode;

fs.writeFileSync('server.ts', code);

const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');
const newLines = lines.filter((line, i) => !(line.trim() === '});' && lines[i-1] && lines[i-1].trim() === '});' && i >= lines.length - 10));
fs.writeFileSync('server.ts', newLines.join('\n'));

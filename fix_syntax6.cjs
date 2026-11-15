const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Literally remove all trailing }); 
// and replace with a single set for the last block

const lines = code.split('\n');
// Find index of PORT
const portIdx = lines.findIndex(l => l.includes('const PORT = 3000;'));

// Get everything up to portIdx, then remove trailing braces
let beforePort = lines.slice(0, portIdx).join('\n');
beforePort = beforePort.replace(/(\s*\}\);\s*)+$/, '\n});\n');

code = beforePort + '\nconst PORT = 3000;\n' + lines.slice(portIdx + 1).join('\n');
fs.writeFileSync('server.ts', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalHeader.tsx', 'utf8');
code = code.replace(/<button onClick=\{\(\) => window.dispatchEvent\(new CustomEvent\('navigate', \{ detail: 'adfree' \}\)\)\}.*?Ad-Free\s*<\/button>/s, '');
fs.writeFileSync('src/components/GlobalHeader.tsx', code);

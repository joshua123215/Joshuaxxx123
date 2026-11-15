const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
  /<GlobalHeader \s*onSearchClick=\{\(\) => setCurrentView\('explore'\)\} /g,
  `<GlobalHeader \n          onSearchClick={() => setCurrentView('search')} `
);
fs.writeFileSync('src/App.tsx', code);

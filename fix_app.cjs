const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove Unsplash image default mapping
appCode = appCode.replace(/image: item\.image \|\| \`https:\/\/images\.unsplash\.com[\s\S]*?\`,/g, 'image: item.image,');

// 2. Remove bottom nav Search icon, keeping only 4 icons
const bottomNavRegex = /<button[\s\S]*?onClick=\{\(\) => setCurrentView\('search'\)\}[\s\S]*?<\/button>/;
appCode = appCode.replace(bottomNavRegex, '');

fs.writeFileSync('src/App.tsx', appCode);


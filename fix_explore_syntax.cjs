const fs = require('fs');
let code = fs.readFileSync('src/components/Explore.tsx', 'utf8');
code = code.replace(/<\/div>\s*\}\)\}\s*<\/div>/g, '</div>\n    </div>'); // Wait, no, it's `</div>\n      )}\n    </div>`
code = code.replace(/\n\s*\)\}\s*<\/div>\s*\)\;/g, '\n    </div>\n  );');
fs.writeFileSync('src/components/Explore.tsx', code);

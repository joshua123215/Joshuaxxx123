const fs = require('fs');

function fixHeroStory() {
    let code = fs.readFileSync('src/components/HeroStory.tsx', 'utf8');
    
    const oldImg = /<img\s*src=\{story\.image \|\| "https:\/\/images\.unsplash\.com[\s\S]*?"\}\s*alt=\{story\.title\}\s*className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"\s*\/>/;
    
    const newImg = `{story.image ? (
        <img 
          src={story.image} 
          alt={story.title}
          className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-800 to-[#0a0a0a] flex items-center justify-center transform group-hover:scale-105 transition-transform duration-700">
          <svg className="w-24 h-24 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
        </div>
      )}`;
      
    code = code.replace(oldImg, newImg);
    
    const formatTimeRegex = /const diff = Math\.floor\(\(Date\.now\(\) - d\.getTime\(\)\) \/ 60000\);\s*if \(diff < 60\) return \`\$\{diff\} min ago\`;\s*if \(diff < 1440\) return \`\$\{Math\.floor\(diff \/ 60\)\} hours ago\`;/g;
    
    const formatTimeReplacement = `const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diff === 0) return 'Just now';
    if (diff < 60) return \`\${diff} min ago\`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return \`\${hours} \${hours === 1 ? 'hour' : 'hours'} ago\`;`;
    
    code = code.replace(formatTimeRegex, formatTimeReplacement);
    fs.writeFileSync('src/components/HeroStory.tsx', code);
}

function fixArticleView() {
    let code = fs.readFileSync('src/components/ArticleView.tsx', 'utf8');
    
    const oldImg = /<img\s*src=\{article\.image \|\| "https:\/\/images\.unsplash\.com[\s\S]*?"\}\s*alt=\{article\.title\}\s*className="w-full h-full object-cover"\s*\/>/;
    
    const newImg = `{article.image ? (
          <img 
            src={article.image} 
            alt={article.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-[#0a0a0a] flex items-center justify-center">
             <svg className="w-24 h-24 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
          </div>
        )}`;
    
    code = code.replace(oldImg, newImg);
    
    const formatTimeRegex = /const diff = Math\.floor\(\(Date\.now\(\) - d\.getTime\(\)\) \/ 60000\);\s*if \(diff < 60\) return \`\$\{diff\} min ago\`;\s*if \(diff < 1440\) return \`\$\{Math\.floor\(diff \/ 60\)\} hours ago\`;/g;
    const formatTimeReplacement = `const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diff === 0) return 'Just now';
    if (diff < 60) return \`\${diff} min ago\`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return \`\${hours} \${hours === 1 ? 'hour' : 'hours'} ago\`;`;
    code = code.replace(formatTimeRegex, formatTimeReplacement);
    
    fs.writeFileSync('src/components/ArticleView.tsx', code);
}

function fixNewsFeed() {
    let code = fs.readFileSync('src/components/NewsFeed.tsx', 'utf8');
    
    const oldImg = /\{item\.image \? \(\s*<div className="relative h-56 overflow-hidden">\s*<img\s*src=\{item\.image\}\s*alt=\{item\.title\}\s*className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"\s*\/>/;
    
    const newImg = `{item.image ? (
                    <div className="relative h-56 overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />`;
                      
    code = code.replace(oldImg, newImg);
    
    // Actually wait, does NewsFeed even have a fallback right now? Let's check NewsFeed image.
    // It says `{item.image && (` or something. Let's just do a simpler replace.
    // I will rewrite this part below.
    
    const formatTimeRegex = /const diff = Math\.floor\(\(Date\.now\(\) - d\.getTime\(\)\) \/ 60000\);\s*if \(diff < 60\) return \`\$\{diff\} min ago\`;\s*if \(diff < 1440\) return \`\$\{Math\.floor\(diff \/ 60\)\} hours ago\`;/g;
    const formatTimeReplacement = `const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (diff === 0) return 'Just now';
    if (diff < 60) return \`\${diff} min ago\`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return \`\${hours} \${hours === 1 ? 'hour' : 'hours'} ago\`;`;
    code = code.replace(formatTimeRegex, formatTimeReplacement);
    
    fs.writeFileSync('src/components/NewsFeed.tsx', code);
}

fixHeroStory();
fixArticleView();
fixNewsFeed();


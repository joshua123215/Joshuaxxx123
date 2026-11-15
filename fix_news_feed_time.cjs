const fs = require('fs');

const formatter = `
  const formatTime = (dateString: string) => {
    if (dateString === 'RECENT') return 'Just now';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 60) return \`\${diff} min ago\`;
    if (diff < 1440) return \`\${Math.floor(diff / 60)} hours ago\`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
`;

function fixFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  if(!code.includes('formatTime')) {
    code = code.replace(/export default function [^\{]+\{/, '$&\n' + formatter);
  }
  code = code.replace(/\{item\.time\}/g, '{formatTime(item.time)}');
  code = code.replace(/\{story\.time\}/g, '{formatTime(story.time)}');
  code = code.replace(/\{article\.time\}/g, '{formatTime(article.time)}');
  
  // also fix image stretching
  code = code.replace(/<img(.*?)className="(.*?)"/g, (match, p1, p2) => {
     if(!p2.includes('object-cover')) {
       return `<img${p1}className="${p2} object-cover"`;
     }
     return match;
  });
  
  // add onError fallback
  code = code.replace(/<img(.*?)src=\{(.*?)\}(.*?)>/g, (match, p1, p2, p3) => {
     if(!match.includes('onError')) {
       return `<img${p1}src={${p2}}${p3} onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800'; }} loading="lazy" >`;
     }
     return match;
  });

  fs.writeFileSync(file, code);
}

fixFile('src/components/NewsFeed.tsx');
fixFile('src/components/HeroStory.tsx');


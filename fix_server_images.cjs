const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const imageLogicOld = `          let imageUrl;
          if (item.media && item.media.$ && item.media.$.url) {
            imageUrl = item.media.$.url;
            imageUrl = imageUrl.replace('/standard/240/', '/standard/800/');
          } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            imageUrl = item.mediaContent.$.url;
          }`;

const imageLogicNew = `          let imageUrl = null;
          if (item.media && item.media.$ && item.media.$.url) {
            imageUrl = item.media.$.url;
          } else if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
            imageUrl = item.mediaContent.$.url;
          } else if (item.enclosure && item.enclosure.url && typeof item.enclosure.type === 'string' && item.enclosure.type.startsWith('image')) {
            imageUrl = item.enclosure.url;
          } else {
            const content = item['content:encoded'] || item.content || '';
            const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch) {
              imageUrl = imgMatch[1];
            }
          }
          if (imageUrl) {
            imageUrl = imageUrl.replace('/standard/240/', '/standard/800/');
          }`;

code = code.replace(imageLogicOld, imageLogicNew);
fs.writeFileSync('server.ts', code);

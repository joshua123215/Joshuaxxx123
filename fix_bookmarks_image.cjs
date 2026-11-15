const fs = require('fs');
let code = fs.readFileSync('src/components/Bookmarks.tsx', 'utf8');

const oldImage = `<div className="w-full sm:w-1/3 h-48 sm:h-auto relative">
                <img 
                  src={item.image || "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&q=80&w=800"} 
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>`;

const newImage = `<div className="w-full sm:w-1/3 h-48 sm:h-auto relative bg-gradient-to-br from-gray-800 to-[#0a0a0a]">
                {item.image ? (
                  <img 
                    src={item.image} 
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                  </div>
                )}
              </div>`;

code = code.replace(oldImage, newImage);
fs.writeFileSync('src/components/Bookmarks.tsx', code);

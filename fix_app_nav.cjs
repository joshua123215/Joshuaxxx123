const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldNav = `<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around p-2 pb-safe z-40">
        
        <button 
          onClick={() => setCurrentView('saved')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'saved' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Bookmark className={\`w-6 h-6 \${currentView === 'saved' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Saved</span>
        </button>
        <button 
          onClick={() => setCurrentView('profile')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'profile' || currentView === 'adfree' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          {user && user.photoURL ? (
             <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-white/20" />
          ) : (
             <UserIcon className={\`w-6 h-6 \${currentView === 'profile' || currentView === 'adfree' ? 'fill-current' : ''}\`} />
          )}
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>`;

const newNav = `<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around p-2 pb-safe z-40">
        <button 
          onClick={() => setCurrentView('news')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'news' || currentView === 'article' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Home className={\`w-6 h-6 \${currentView === 'news' || currentView === 'article' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        
        <button 
          onClick={() => setCurrentView('explore')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'explore' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Compass className={\`w-6 h-6 \${currentView === 'explore' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Explore</span>
        </button>

        <button 
          onClick={() => setCurrentView('movies')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'movies' || currentView === 'adfree' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Film className={\`w-6 h-6 \${currentView === 'movies' || currentView === 'adfree' ? 'fill-current' : ''}\`} />
          <span className="text-[10px] font-medium">Movies</span>
        </button>

        <button 
          onClick={() => setCurrentView('profile')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'profile' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          {user && user.photoURL ? (
             <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-white/20" />
          ) : (
             <UserIcon className={\`w-6 h-6 \${currentView === 'profile' ? 'fill-current' : ''}\`} />
          )}
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>`;

code = code.replace(oldNav, newNav);
fs.writeFileSync('src/App.tsx', code);

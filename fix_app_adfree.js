const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
const importStatement = `const AdFreeMovies = React.lazy(() => import('./components/AdFreeMovies'));\n`;
code = code.replace(/const Explore = React\.lazy\(\(\) => import\('\.\/components\/Explore'\)\);/, `const Explore = React.lazy(() => import('./components/Explore'));\n${importStatement}`);

// Add to renderContent
const renderContentReplace = `      case 'movies':
        return <MovieSearch />;`;
const renderContentNew = `      case 'adfree':
        return <AdFreeMovies />;
      case 'movies':
        return <MovieSearch />;`;
code = code.replace(renderContentReplace, renderContentNew);

// Add to Mobile Bottom Navigation (replacing the normal Movies icon with Ad-Free or adding it)
// I will just change the text of the "Movies" button to "Search" and add "Ad-Free" or just add "Ad-Free".
// Wait, if I change it, I should just make sure it's accessible. Maybe just add a new button to the mobile nav.
// Let's add the Database icon for Ad-Free movies.
const mobileNavReplace = `<button 
          onClick={() => setCurrentView('movies')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'movies' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Film className={\`w-6 h-6 \${currentView === 'movies' ? 'fill-current text-blue-500' : ''}\`} />
          <span className="text-[10px] font-medium">Movies</span>
        </button>`;
const mobileNavNew = `<button 
          onClick={() => setCurrentView('movies')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'movies' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <Film className={\`w-6 h-6 \${currentView === 'movies' ? 'fill-current text-blue-500' : ''}\`} />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        <button 
          onClick={() => setCurrentView('adfree')}
          className={\`flex flex-col items-center gap-1 p-2 \${currentView === 'adfree' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}\`}
        >
          <svg className={\`w-6 h-6 \${currentView === 'adfree' ? 'text-green-500' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          <span className="text-[10px] font-medium">Ad-Free</span>
        </button>`;
code = code.replace(mobileNavReplace, mobileNavNew);

// Add to Desktop Nav (GlobalMenu.tsx needs to be updated instead if we want it there).

fs.writeFileSync('src/App.tsx', code);

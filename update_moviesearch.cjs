const fs = require('fs');

let code = fs.readFileSync('src/components/MovieSearch.tsx', 'utf8');

// 1. Add NativeVideoPlayer and archiveApi imports
code = code.replace(
  'import CleanVideoPlayer from "./CleanVideoPlayer";',
  'import CleanVideoPlayer from "./CleanVideoPlayer";\nimport NativeVideoPlayer from "./NativeVideoPlayer";\nimport { getArchiveMp4 } from "../utils/archiveApi";'
);

// 2. Add state for direct URL
const stateInjection = `  const [trailerUrls, setTrailerUrls] = useState<Record<string, string>>({});
  const [loadingTrailers, setLoadingTrailers] = useState<Record<string, boolean>>({});
  const [directUrls, setDirectUrls] = useState<Record<string, string>>({});
  const [loadingDirectUrls, setLoadingDirectUrls] = useState<Record<string, boolean>>({});

  const handlePlayMovie = async (movie: Movie) => {
    setPlayingTrailerMovieId(null);
    if (playingMovieId === movie.imdbID) {
      setPlayingMovieId(null);
      return;
    }
    
    setPlayingMovieId(movie.imdbID);
    
    // Attempt to fetch direct ad-free URL if we haven't already
    if (!directUrls[movie.imdbID] && !loadingDirectUrls[movie.imdbID]) {
      setLoadingDirectUrls(prev => ({ ...prev, [movie.imdbID]: true }));
      const directUrl = await getArchiveMp4(movie.Title);
      if (directUrl) {
        setDirectUrls(prev => ({ ...prev, [movie.imdbID]: directUrl }));
      }
      setLoadingDirectUrls(prev => ({ ...prev, [movie.imdbID]: false }));
    }
  };
`;
code = code.replace(
  /const \[trailerUrls, setTrailerUrls\] = useState<Record<string, string>>\(\{\}\);\s*const \[loadingTrailers, setLoadingTrailers\] = useState<Record<string, boolean>>\(\{\}\);/,
  stateInjection
);

// 3. Update the render logic for the player to use NativeVideoPlayer if directUrl is available
const renderPlayerOriginal = `{playingMovieId === movie.imdbID ? (
                    <CleanVideoPlayer
                      id={\`video-iframe-\${movie.imdbID}\`}
                      src={SERVERS.find(s => s.id === playerServerId)?.url(movie.Type, movie.imdbID, audioLanguage) || SERVERS[0].url(movie.Type, movie.imdbID, audioLanguage)}
                    />
                  ) : playingTrailerMovieId === movie.imdbID ? (`;

const renderPlayerNew = `{playingMovieId === movie.imdbID ? (
                    loadingDirectUrls[movie.imdbID] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 text-white gap-3">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        <span className="text-sm font-medium">Searching for Ad-Free Stream...</span>
                      </div>
                    ) : directUrls[movie.imdbID] ? (
                      <NativeVideoPlayer
                        src={directUrls[movie.imdbID]}
                        poster={movie.Poster !== "N/A" ? movie.Poster : undefined}
                      />
                    ) : (
                      <CleanVideoPlayer
                        id={\`video-iframe-\${movie.imdbID}\`}
                        src={SERVERS.find(s => s.id === playerServerId)?.url(movie.Type, movie.imdbID, audioLanguage) || SERVERS[0].url(movie.Type, movie.imdbID, audioLanguage)}
                      />
                    )
                  ) : playingTrailerMovieId === movie.imdbID ? (`;
code = code.replace(renderPlayerOriginal, renderPlayerNew);

// 4. Update the "Watch Full Movie" button onClick
const buttonOriginal = `onClick={() => {
                      setPlayingTrailerMovieId(null);
                      setPlayingMovieId(playingMovieId === movie.imdbID ? null : movie.imdbID);
                    }}`;
const buttonNew = `onClick={() => handlePlayMovie(movie)}`;
code = code.replace(buttonOriginal, buttonNew);

fs.writeFileSync('src/components/MovieSearch.tsx', code);

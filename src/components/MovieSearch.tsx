import React, { useState, useRef } from "react";
import { 
  Search, Loader2, Play, Calendar, Film, Download, X, ExternalLink, 
  Video, Globe, HardDrive, Check, Copy, FolderDown, Zap, Sparkles, Gauge, CheckCircle2, AlertTriangle, Ban
} from "lucide-react";
import axios from "axios";
import CleanVideoPlayer from "./CleanVideoPlayer";
import NativeVideoPlayer from "./NativeVideoPlayer";
import { getArchiveMp4 } from "../utils/archiveApi";
import GoogleDriveSection, { DriveOverwriteConfirmModal, GoogleSignInButton } from "./GoogleDriveSection";
import {
  DEFAULT_DRIVE_URL,
  DriveSavedFile,
  DriveSaveProgress,
  MovieQualityTier,
  connectGoogleDriveAccount,
  getDriveAccessToken,
  openUrlViaAnchor,
  saveMovieToGoogleDrive,
} from "../utils/googleDrive";
import {
  cancelTrackedDriveJob,
  patchTrackedDriveJob,
  upsertTrackedDriveJob,
} from "../utils/driveJobStore";
import { DEFAULT_GOOGLE_DRIVE_EMAIL } from "../lib/firebase";

interface Movie {
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
  Type: string;
  ytTrailerCode?: string;
  Language?: string;
}

interface TrailerInfo {
  embedUrl: string | null;
  watchUrl: string;
  videoId: string | null;
}

const SERVERS = [
  { id: "vidlink", name: "Movie Box (HD)", url: (type: string, id: string) => `https://vidlink.pro/${type === 'series' ? 'tv' : 'movie'}/${id}?primaryColor=3B82F6&autoplay=true&lang=en&ds_lang=en&sub_lang=en` },
  { id: "2embed", name: "2Embed (Fast)", url: (type: string, id: string) => type === 'series' ? `https://www.2embed.cc/embedtv/${id}&s=1&e=1&lang=en` : `https://www.2embed.cc/embed/${id}?lang=en` },
  { id: "vidsrcto", name: "VidSrc To", url: (type: string, id: string) => `https://vidsrc.to/embed/${type === 'series' ? 'tv' : 'movie'}/${id}?ds_lang=en&lang=en` },
  { id: "autoembed", name: "AutoEmbed", url: (type: string, id: string) => type === 'series' ? `https://autoembed.co/tv/imdb/${id}/1/1?lang=en` : `https://autoembed.co/movie/imdb/${id}?lang=en` },
  { id: "vidspark", name: "VidSpark", url: (type: string, id: string) => type === 'series' ? `https://moviesapi.to/tv/${id}-1-1?lang=en` : `https://moviesapi.to/movie/${id}?lang=en` },
];

export default function MovieSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [sortMode, setSortMode] = useState<"popular" | "latest">("popular");
  const [englishOnly, setEnglishOnly] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(false);
  const [playingMovieId, setPlayingMovieId] = useState<string | null>(null);
  const [playerServerId, setPlayerServerId] = useState<string>("vidlink");
  const [useDirectMp4, setUseDirectMp4] = useState<Record<string, boolean>>({});
  const [playingTrailerMovieId, setPlayingTrailerMovieId] = useState<string | null>(null);
  const [trailerModalMovie, setTrailerModalMovie] = useState<Movie | null>(null);
  const [trailerInfoMap, setTrailerInfoMap] = useState<Record<string, TrailerInfo>>({});
  const [loadingTrailers, setLoadingTrailers] = useState<Record<string, boolean>>({});
  const [directUrls, setDirectUrls] = useState<Record<string, string>>({});

  // Movie Download States
  const [downloadModalMovie, setDownloadModalMovie] = useState<Movie | null>(null);
  const [movieTorrents, setMovieTorrents] = useState<any[]>([]);
  const [archiveMp4Url, setArchiveMp4Url] = useState<string | null>(null);
  const [loadingDownloads, setLoadingDownloads] = useState<boolean>(false);
  const [copiedMagnet, setCopiedMagnet] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<MovieQualityTier>("420p");
  const [showAllTorrents, setShowAllTorrents] = useState<boolean>(false);

  // Google Drive States
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveRefreshTrigger, setDriveRefreshTrigger] = useState<number>(0);
  const [savingToDrive, setSavingToDrive] = useState<boolean>(false);
  const [isCancellingDrive, setIsCancellingDrive] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeFolderUrl, setActiveFolderUrl] = useState<string | null>(null);
  const [autoOpenDrive, setAutoOpenDrive] = useState<boolean>(true);
  const [driveProgress, setDriveProgress] = useState<DriveSaveProgress | null>(null);
  const [driveSaveMessage, setDriveSaveMessage] = useState<{ text: string; link?: string } | null>(null);
  const [driveSaveError, setDriveSaveError] = useState<string | null>(null);
  const [showOtherDownloadOptions, setShowOtherDownloadOptions] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    fileName: string;
    existingFile?: DriveSavedFile | null;
    payload: {
      quality: MovieQualityTier;
      videoUrl?: string | null;
      torrentUrl?: string | null;
      magnetUrl?: string | null;
      sourceSizeLabel?: string;
    };
  } | null>(null);

  const parseSizeToMb = (sizeStr?: string, sizeBytes?: number): number => {
    if (typeof sizeBytes === "number" && sizeBytes > 0) {
      return sizeBytes / (1024 * 1024);
    }
    if (!sizeStr) return 999999;
    const match = String(sizeStr).trim().match(/([\d.]+)\s*(gb|mb|kb)/i);
    if (!match) return 999999;
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "gb") return num * 1024;
    if (unit === "mb") return num;
    if (unit === "kb") return num / 1024;
    return 999999;
  };

  const getRecommendedTorrent = (torrents: any[], quality: MovieQualityTier) => {
    if (!torrents || torrents.length === 0) return null;
    const non4k = torrents.filter((t) => String(t.quality || "").toLowerCase() !== "2160p");
    const basePool = non4k.length > 0 ? non4k : torrents;
    const foreignTag = /\b(french|francais|spanish|espanol|hindi|italian|german|russian|korean|turkish|arabic|portuguese|vostfr|vf)\b/i;
    const nonForeignPool = basePool.filter((t) => !foreignTag.test(`${t.url || ""} ${t.type || ""}`));
    const pool = nonForeignPool.length > 0 ? nonForeignPool : basePool;

    if (quality === "420p") {
      // Data-Saver Blurry 420p (~400 MB): pick smallest available rip (prefer <= 1000 MB)
      return [...pool].sort(
        (a, b) => parseSizeToMb(a.size, a.size_bytes) - parseSizeToMb(b.size, b.size_bytes)
      )[0];
    }

    // Clear 1080p (~1 GB): prefer 1080p closest to ~1 GB (1024 MB)
    const hd1080 = pool.filter((t) => String(t.quality || "").includes("1080"));
    const candidates = hd1080.length > 0 ? hd1080 : pool;
    return [...candidates].sort((a, b) => {
      const diffA = Math.abs(parseSizeToMb(a.size, a.size_bytes) - 1024);
      const diffB = Math.abs(parseSizeToMb(b.size, b.size_bytes) - 1024);
      return diffA - diffB;
    })[0];
  };

  const buildMagnetLink = (hash: string, title: string) => {
    const trackers = [
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.coppersurfer.tk:6969',
      'udp://glotorrents.pw:6969/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://p4p.arenabg.com:1337',
      'udp://tracker.leechers-paradise.org:6969',
    ];
    const trParams = trackers.map(tr => `&tr=${encodeURIComponent(tr)}`).join('');
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trParams}`;
  };

  const handleOpenDownloadModal = async (movie: Movie) => {
    setDownloadModalMovie(movie);
    setLoadingDownloads(true);
    setMovieTorrents([]);
    setArchiveMp4Url(null);
    setCopiedMagnet(null);
    setSelectedQuality("420p");
    setShowAllTorrents(false);
    setDriveSaveMessage(null);
    setDriveSaveError(null);
    setPendingOverwrite(null);

    try {
      const torrentsPromise = axios.get(`/api/proxy-yts?imdb_id=${movie.imdbID}`)
        .then(res => {
          if (res.data?.data?.movie?.torrents) {
            setMovieTorrents(res.data.data.movie.torrents);
          }
        })
        .catch(err => console.warn('Could not fetch torrents:', err));

      const archivePromise = getArchiveMp4(movie.Title)
        .then(mp4Url => {
          if (mp4Url) {
            setArchiveMp4Url(mp4Url);
          }
        })
        .catch(err => console.warn('Could not fetch archive MP4:', err));

      await Promise.allSettled([torrentsPromise, archivePromise]);
    } catch (err) {
      console.warn('Error loading movie download files:', err);
    } finally {
      setLoadingDownloads(false);
    }
  };

  const handleCopyMagnet = (magnetUrl: string, hash: string) => {
    navigator.clipboard.writeText(magnetUrl);
    setCopiedMagnet(hash);
    setTimeout(() => {
      setCopiedMagnet(null);
    }, 2500);
  };

  const handleConnectDriveInModal = async () => {
    setDriveSaveError(null);
    try {
      const { user, accessToken } = await connectGoogleDriveAccount(DEFAULT_GOOGLE_DRIVE_EMAIL);
      setDriveToken(accessToken);
      setDriveEmail(user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
      setDriveRefreshTrigger((v) => v + 1);
      return accessToken;
    } catch (err: any) {
      setDriveSaveError(err?.message || "Failed to connect Google Drive. Please allow pop-ups and sign in with Google.");
      return null;
    }
  };

  const handleCancelDriveDownload = async () => {
    setIsCancellingDrive(true);
    try {
      abortControllerRef.current?.abort();
      if (activeJobId) {
        await cancelTrackedDriveJob(activeJobId);
      }
      setDriveProgress(null);
      setSavingToDrive(false);
      setActiveJobId(null);
      setDriveSaveError(null);
      setDriveSaveMessage({
        text: "Download cancelled. Nothing was saved to Google Drive.",
        link: activeFolderUrl || DEFAULT_DRIVE_URL,
      });
    } finally {
      setIsCancellingDrive(false);
    }
  };

  const handleSaveToDrive = async (
    payload: {
      quality: MovieQualityTier;
      videoUrl?: string | null;
      torrentUrl?: string | null;
      magnetUrl?: string | null;
      sourceSizeLabel?: string;
    },
    overwriteExistingFileId?: string
  ) => {
    if (!downloadModalMovie) return;
    setDriveSaveError(null);
    setDriveSaveMessage(null);

    let activeToken = driveToken || getDriveAccessToken();
    if (!activeToken) {
      activeToken = await handleConnectDriveInModal();
      if (!activeToken) return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let startedJobId: string | null = null;
    setActiveJobId(null);
    setSavingToDrive(true);
    setDriveProgress({
      status: "queued",
      progressPercent: 4,
      message: `Connecting to Google Drive for "${downloadModalMovie.Title}" (${payload.quality === "420p" ? "420p ~400 MB" : "1080p ~1 GB"})...`,
    });

    try {
      const result = await saveMovieToGoogleDrive({
        accessToken: activeToken,
        title: downloadModalMovie.Title,
        year: downloadModalMovie.Year,
        imdbId: downloadModalMovie.imdbID,
        quality: payload.quality,
        videoUrl: payload.videoUrl,
        torrentUrl: payload.torrentUrl,
        magnetUrl: payload.magnetUrl,
        sourceSizeLabel: payload.sourceSizeLabel,
        overwriteExistingFileId,
        signal: controller.signal,
        onJobCreated: (info) => {
          startedJobId = info.jobId;
          setActiveJobId(info.jobId);
          if (info.folderUrl) {
            setActiveFolderUrl(info.folderUrl);
          }
          upsertTrackedDriveJob({
            jobId: info.jobId,
            jobKey: info.jobKey,
            title: info.title,
            quality: info.quality,
            targetFileName: info.targetFileName,
            status: "queued",
            progressPercent: 3,
            message: `Downloading "${info.title}" to Google Drive...`,
            folderUrl: info.folderUrl || DEFAULT_DRIVE_URL,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        },
        onProgress: (p) => {
          if (!controller.signal.aborted) {
            setDriveProgress(p);
            if (p.folderUrl) setActiveFolderUrl(p.folderUrl);
            if (startedJobId) {
              patchTrackedDriveJob(startedJobId, {
                status: p.status,
                progressPercent: p.progressPercent,
                message: p.message,
                folderUrl: p.folderUrl,
              });
            }
          }
        },
      });

      if (result.status === "cancelled" || controller.signal.aborted) {
        if (startedJobId) {
          patchTrackedDriveJob(startedJobId, {
            status: "cancelled",
            message: "Download cancelled by user.",
          });
        }
        setDriveProgress(null);
        setActiveJobId(null);
        setDriveSaveMessage({
          text: "Download cancelled.",
          link: result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL,
        });
        return;
      }

      if (result.status === "duplicate") {
        setDriveProgress(null);
        setActiveJobId(null);
        if (result.folderUrl) setActiveFolderUrl(result.folderUrl);
        setPendingOverwrite({
          fileName: result.targetFileName || downloadModalMovie.Title,
          existingFile: result.existingFile,
          payload,
        });
        return;
      }

      setPendingOverwrite(null);
      setDriveProgress(null);
      setActiveJobId(null);
      setDriveRefreshTrigger((v) => v + 1);
      const targetDriveLink =
        result.file?.webViewLink || result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL;
      const tierText = payload.quality === "420p" ? "Blurry 420p (~400 MB)" : "Clear 1080p (~1 GB)";
      if (startedJobId) {
        patchTrackedDriveJob(startedJobId, {
          status: "completed",
          progressPercent: 100,
          message: `Saved "${result.file?.name || downloadModalMovie.Title}" (${tierText}) to Google Drive!`,
          folderUrl: result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL,
          file: result.file,
        });
      }
      setDriveSaveMessage({
        text: `Downloaded "${result.file?.name || downloadModalMovie.Title}" (${tierText}) to Google Drive (${driveEmail || DEFAULT_GOOGLE_DRIVE_EMAIL}).`,
        link: targetDriveLink,
      });

      if (autoOpenDrive && targetDriveLink) {
        openUrlViaAnchor(targetDriveLink);
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError") {
        if (startedJobId) {
          patchTrackedDriveJob(startedJobId, {
            status: "cancelled",
            message: "Download cancelled by user.",
          });
        }
        setDriveProgress(null);
        setActiveJobId(null);
        setDriveSaveMessage({ text: "Download cancelled." });
        return;
      }
      setDriveProgress(null);
      setActiveJobId(null);
      const msg = err?.message || "Failed to save to Google Drive.";
      if (startedJobId) {
        patchTrackedDriveJob(startedJobId, {
          status: "failed",
          message: msg,
        });
      }
      setDriveSaveError(msg);
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("reconnect")) {
        setDriveToken(null);
      }
    } finally {
      setSavingToDrive(false);
    }
  };

  const handleSwitchToNextServer = () => {
    const currentIndex = SERVERS.findIndex(s => s.id === playerServerId);
    const nextIndex = (currentIndex + 1) % SERVERS.length;
    setPlayerServerId(SERVERS[nextIndex].id);
  };

  const handlePlayMovie = (movie: Movie) => {
    setPlayingTrailerMovieId(null);
    if (playingMovieId === movie.imdbID) {
      setPlayingMovieId(null);
      return;
    }

    setPlayingMovieId(movie.imdbID);

    // Check Archive.org MP4 in the background without blocking stream startup
    if (!directUrls[movie.imdbID]) {
      getArchiveMp4(movie.Title)
        .then((directUrl) => {
          if (directUrl) {
            setDirectUrls((prev) => ({ ...prev, [movie.imdbID]: directUrl }));
          }
        })
        .catch(() => {});
    }
  };

  const handlePlayTrailer = async (movie: Movie, isInline: boolean) => {
    if (trailerInfoMap[movie.imdbID]) {
      if (isInline) {
        setPlayingTrailerMovieId(movie.imdbID);
        setPlayingMovieId(null);
      } else {
        setTrailerModalMovie(movie);
      }
      return;
    }

    setLoadingTrailers(prev => ({ ...prev, [movie.imdbID]: true }));
    const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${movie.Title} ${movie.Year !== 'N/A' ? movie.Year : ''} official movie trailer`
    )}`;
    let info: TrailerInfo = {
      embedUrl: null,
      watchUrl: fallbackSearchUrl,
      videoId: null
    };

    try {
      const params = new URLSearchParams({
        title: movie.Title,
        year: movie.Year || '',
        imdbId: movie.imdbID || '',
        type: movie.Type || 'movie',
        ytCode: movie.ytTrailerCode || ''
      });
      const res = await axios.get(`/api/movies/trailer?${params.toString()}`, { timeout: 10000 });
      if (res.data) {
        info = {
          embedUrl: res.data.embedUrl || null,
          watchUrl: res.data.watchUrl || fallbackSearchUrl,
          videoId: res.data.videoId || null
        };
      }
    } catch (err) {
      console.warn("Could not resolve trailer:", err);
    }

    setTrailerInfoMap(prev => ({ ...prev, [movie.imdbID]: info }));
    setLoadingTrailers(prev => ({ ...prev, [movie.imdbID]: false }));

    if (isInline) {
      setPlayingTrailerMovieId(movie.imdbID);
      setPlayingMovieId(null);
    } else {
      setTrailerModalMovie(movie);
    }
  };

  React.useEffect(() => {
    if (!searchQuery && movies.length === 0) {
      fetchRecentMovies(sortMode);
    }
  }, []);

  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchRecentMovies = async (
    mode: "popular" | "latest" = sortMode,
    englishMode: boolean = englishOnly
  ) => {
    setIsLoading(true);
    setSearchError(null);
    try {
      const res = await axios.get(`/api/movies/recent?sort=${mode}&lang=${englishMode ? "en" : "all"}`);
      if (res.data?.data?.movies && res.data.data.movies.length > 0) {
        const recentMovies: Movie[] = res.data.data.movies.map((m: any) => ({
          imdbID: m.imdb_code || Math.random().toString(),
          Title: m.title,
          Year: m.year ? m.year.toString() : 'N/A',
          Poster: m.medium_cover_image || 'N/A',
          Type: 'movie',
          ytTrailerCode: m.yt_trailer_code || undefined,
          Language: m.language === 'en' ? 'English' : m.language ? String(m.language).toUpperCase() : 'English',
        }));
        setMovies(recentMovies);
      } else {
        throw new Error("No movies found in response");
      }
    } catch(err) {
      console.error("Failed to fetch movies from accel.li, falling back to OMDB:", err);
      try {
        const fallbackRes = await axios.get('https://www.omdbapi.com/?s=Avengers&type=movie&apikey=thewdb');
        if (fallbackRes.data.Response === "True") {
          setMovies(fallbackRes.data.Search);
        } else {
          setMovies([]);
        }
      } catch {
        setMovies([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const prioritizeEnglishMovies = async (candidates: Movie[], englishMode: boolean): Promise<Movie[]> => {
    if (!englishMode || candidates.length === 0) return candidates;
    const head = candidates.slice(0, 8);
    const enrichedHead = await Promise.all(
      head.map(async (m) => {
        if (m.Language) return m;
        try {
          const detail = await axios.get(`https://www.omdbapi.com/?i=${encodeURIComponent(m.imdbID)}&apikey=thewdb`, {
            timeout: 3500,
          });
          if (detail.data?.Response === "True" && detail.data?.Language) {
            return { ...m, Language: String(detail.data.Language) };
          }
        } catch {
          // keep original if detail lookup times out
        }
        return m;
      })
    );
    const merged = [...enrichedHead, ...candidates.slice(8)];
    const englishMatched = merged.filter((m) => !m.Language || /\benglish\b/i.test(m.Language));
    return englishMatched.length > 0 ? englishMatched : merged;
  };

  const searchMovies = async (e?: React.FormEvent, englishModeOverride?: boolean) => {
    if (e) e.preventDefault();
    const useEnglish = englishModeOverride !== undefined ? englishModeOverride : englishOnly;
    if (!searchQuery.trim()) {
      fetchRecentMovies(sortMode, useEnglish);
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setPlayingMovieId(null);
    try {
      let results: Movie[] = [];
      const query = searchQuery.trim();
      
      // 1. If it's an IMDB ID
      if (/^tt\d+$/i.test(query)) {
        const idRes = await axios.get(`https://www.omdbapi.com/?i=${query}&apikey=thewdb`);
        if (idRes.data.Response === "True") {
           results.push(idRes.data);
        }
      } else {
        // Try extracting year if query ends with 4 digits e.g. "Pirates 2005"
        let titleQuery = query;
        let yearQuery = "";
        const yearMatch = query.match(/^(.*?)\s+(\d{4})$/);
        if (yearMatch) {
          titleQuery = yearMatch[1];
          yearQuery = `&y=${yearMatch[2]}`;
        }
        
        // Parallel requests: Search (s=) and Exact Title (t=)
        const [searchRes, exactRes] = await Promise.allSettled([
          axios.get(`https://www.omdbapi.com/?s=${encodeURIComponent(titleQuery)}${yearQuery}&apikey=thewdb`),
          axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(titleQuery)}${yearQuery}&apikey=thewdb`)
        ]);
        
        if (exactRes.status === "fulfilled" && exactRes.value.data.Response === "True") {
           results.push(exactRes.value.data);
        }
        
        if (searchRes.status === "fulfilled" && searchRes.value.data.Response === "True") {
           results = [...results, ...searchRes.value.data.Search];
           
           if (parseInt(searchRes.value.data.totalResults) > 10) {
             try {
               const res2 = await axios.get(
                 `https://www.omdbapi.com/?s=${encodeURIComponent(titleQuery)}${yearQuery}&page=2&apikey=thewdb`,
               );
               if (res2.data.Response === "True") {
                 results = [...results, ...res2.data.Search];
               }
             } catch (e) {
               console.error("Error fetching page 2:", e);
             }
           }
        }
      }

      if (results.length > 0) {
        // Remove duplicates
        const uniqueMovies = Array.from(
          new Map(results.map((m: Movie) => [m.imdbID, m])).values(),
        ) as Movie[];
        const ordered = await prioritizeEnglishMovies(uniqueMovies, useEnglish);
        setMovies(ordered);
      } else {
        // Fallback to AI thematic/genre search
        try {
          const aiRes = await axios.post("/api/recommend-movies", {
            query,
            language: useEnglish ? "English" : "Any",
          });
          if (aiRes.data?.titles && Array.isArray(aiRes.data.titles)) {
            const titles: string[] = aiRes.data.titles;
            const moviePromises = titles.map(t => axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(t)}&apikey=thewdb`));
            const omdbResponses = await Promise.allSettled(moviePromises);
            
            const aiResults: Movie[] = [];
            for (const res of omdbResponses) {
               if (res.status === "fulfilled" && res.value.data.Response === "True") {
                  aiResults.push(res.value.data);
               }
            }
            
            if (aiResults.length > 0) {
               const uniqueMovies = Array.from(
                 new Map(aiResults.map((m: Movie) => [m.imdbID, m])).values(),
               ) as Movie[];
               const ordered = await prioritizeEnglishMovies(uniqueMovies, useEnglish);
               setMovies(ordered);
               setIsLoading(false);
               return; // Exit early if we found thematic movies
            }
          }
        } catch (e: any) {
          console.error("AI recommendation failed", e);
          if (e.response?.status === 503) {
            setMovies([]);
            setSearchError("The AI recommendation service is currently busy due to high demand. Please search for a specific movie title instead.");
            setIsLoading(false);
            return;
          }
        }

        setMovies([]);
        setSearchError("No results found. For obscure/adult movies, try typing 'Title Year' (e.g. 'Pirates 2005') or an IMDb ID (e.g. 'tt0477457').");
      }
    } catch (error) {
      console.error("Error fetching movies:", error);
      setMovies([]);
      setSearchError("An error occurred while searching.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6 pb-24">
      
      {/* Official Movie Trailer Modal */}
      {trailerModalMovie && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="max-w-4xl w-full bg-[#141414] rounded-2xl border border-white/10 flex flex-col relative shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                    {trailerModalMovie.Title} ({trailerModalMovie.Year})
                  </h3>
                  <p className="text-xs text-gray-400">Official HD Movie Trailer</p>
                </div>
              </div>
              <button 
                onClick={() => setTrailerModalMovie(null)}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="Close Trailer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="relative w-full aspect-video bg-black">
              {loadingTrailers[trailerModalMovie.imdbID] ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              ) : trailerInfoMap[trailerModalMovie.imdbID]?.embedUrl ? (
                <iframe
                  src={trailerInfoMap[trailerModalMovie.imdbID].embedUrl!}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen={true}
                  title={`${trailerModalMovie.Title} Official Trailer`}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <Video className="w-12 h-12 text-red-500" />
                  <p className="text-sm text-gray-300 max-w-md">
                    Embedded trailer preview is unavailable for this title. Watch the official trailer directly on YouTube.
                  </p>
                  <a
                    href={trailerInfoMap[trailerModalMovie.imdbID]?.watchUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trailerModalMovie.Title} ${trailerModalMovie.Year} official trailer`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Play Trailer on YouTube</span>
                  </a>
                </div>
              )}
            </div>

            {/* Footer Controls */}
            <div className="p-4 sm:p-5 bg-[#1a1a1a] border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <a
                  href={trailerInfoMap[trailerModalMovie.imdbID]?.watchUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(
                    `${trailerModalMovie.Title} ${trailerModalMovie.Year} official trailer`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-xs transition-all flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Watch on YouTube</span>
                </a>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const m = trailerModalMovie;
                    setTrailerModalMovie(null);
                    handleOpenDownloadModal(m);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400 hover:text-green-300 font-bold text-xs transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Files</span>
                </button>
                <button
                  onClick={() => {
                    const m = trailerModalMovie;
                    setTrailerModalMovie(null);
                    setPlayingTrailerMovieId(null);
                    if (playingMovieId !== m.imdbID) {
                      handlePlayMovie(m);
                    }
                    const el = document.getElementById(`movie-article-${m.imdbID}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/40"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Watch Full Movie Now</span>
                </button>
                <button
                  onClick={() => setTrailerModalMovie(null)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movie Files Download & Google Drive Modal */}
      {downloadModalMovie && (
        <div className="fixed inset-0 z-[9999] bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="max-w-2xl w-full bg-[#141414] rounded-2xl border border-white/10 flex flex-col relative shadow-2xl overflow-hidden my-auto max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 flex-shrink-0">
                  <FolderDown className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-green-400">
                    Data-Saver Downloads & Google Drive
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                    {downloadModalMovie.Title} ({downloadModalMovie.Year})
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setDownloadModalMovie(null)}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
              {/* Quality Tier Selector (Blurry 420p ~400MB vs Clear 1080p ~1GB) */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Choose Quality & Data Size
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedQuality("420p")}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      selectedQuality === "420p"
                        ? "bg-green-600/15 border-green-500 ring-1 ring-green-400/50"
                        : "bg-[#1b1b1b] border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                        <Gauge className="w-4 h-4 text-green-400" />
                        Blurry • 420p
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-300 text-[11px] font-bold">
                        ~400 MB
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Low data usage for phones. Saves up to 75% mobile data.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedQuality("1080p")}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      selectedQuality === "1080p"
                        ? "bg-blue-600/15 border-blue-500 ring-1 ring-blue-400/50"
                        : "bg-[#1b1b1b] border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        Clear HD • 1080p
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[11px] font-bold">
                        ~1 GB
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Clear 1080p high-definition capped around ~1 GB target.
                    </p>
                  </button>
                </div>
              </div>

              {/* Google Drive Connection Bar inside Modal */}
              <div className="p-3.5 rounded-2xl bg-[#1a1a1a] border border-white/10 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-blue-400" />
                      <span>Google Drive Account Destination</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {driveToken
                        ? `Connected as ${driveEmail || DEFAULT_GOOGLE_DRIVE_EMAIL} (Folder: GlobalNews Movies)`
                        : `Sign in with ${DEFAULT_GOOGLE_DRIVE_EMAIL} — downloads save straight into your Google Drive app.`}
                    </p>
                  </div>
                  {driveToken ? (
                    <a
                      href={activeFolderUrl || DEFAULT_DRIVE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 self-start sm:self-center shadow"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Google Drive</span>
                    </a>
                  ) : (
                    <GoogleSignInButton
                      onClick={handleConnectDriveInModal}
                      disabled={savingToDrive}
                      label="Sign in with Google"
                    />
                  )}
                </div>

                <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer select-none pt-1 border-t border-white/5">
                  <input
                    type="checkbox"
                    checked={autoOpenDrive}
                    onChange={(e) => setAutoOpenDrive(e.target.checked)}
                    className="rounded border-white/20 bg-black/50 text-blue-500 focus:ring-blue-500"
                  />
                  <span>Automatically take me to my Google Drive app when download completes</span>
                </label>
              </div>

              {driveProgress && (
                <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/35 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-blue-200">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
                      <span>{driveProgress.message}</span>
                    </span>
                    <span className="flex-shrink-0">{driveProgress.progressPercent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-black/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(3, driveProgress.progressPercent))}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <a
                      href={driveProgress.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Google Drive App</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleCancelDriveDownload}
                      disabled={isCancellingDrive}
                      className="px-3.5 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 shadow"
                    >
                      {isCancellingDrive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>{isCancellingDrive ? "Cancelling..." : "Cancel Download"}</span>
                    </button>
                  </div>
                </div>
              )}

              {driveSaveMessage && (
                <div className="p-3.5 rounded-2xl bg-green-500/15 border border-green-500/30 text-green-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>{driveSaveMessage.text}</span>
                  </div>
                  {driveSaveMessage.link && (
                    <a
                      href={driveSaveMessage.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center gap-1.5 flex-shrink-0 self-start shadow"
                    >
                      <span>Open in Google Drive</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              {driveSaveError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{driveSaveError}</span>
                </div>
              )}

              {loadingDownloads ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-9 h-9 text-green-500 animate-spin" />
                  <p className="text-sm font-medium text-gray-300">Checking compact 420p & 1080p sources...</p>
                  <span className="text-xs text-gray-500">Filtering out oversized 4K files to protect your data</span>
                </div>
              ) : (
                <>
                  {/* Option 1: Direct MP4 -> Download to Google Drive (Primary) */}
                  {archiveMp4Url && (
                    <div className="p-4 bg-gradient-to-r from-blue-950/50 to-emerald-950/30 rounded-2xl border border-blue-500/40 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-300 font-bold text-xs uppercase">
                            Ready for Drive
                          </span>
                          <span className="text-xs text-gray-200 font-semibold">
                            {selectedQuality === "420p" ? "Blurry 420p (~400 MB)" : "Clear 1080p (~1 GB)"}
                          </span>
                        </div>
                        <span className="text-[11px] text-green-400 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Server Compressed
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={savingToDrive}
                          onClick={() =>
                            handleSaveToDrive({
                              quality: selectedQuality,
                              videoUrl: archiveMp4Url,
                              sourceSizeLabel: selectedQuality === "420p" ? "~400 MB" : "~1 GB",
                            })
                          }
                          className="py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 cursor-pointer"
                        >
                          {savingToDrive ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <HardDrive className="w-4 h-4" />
                          )}
                          <span>
                            {savingToDrive
                              ? "Downloading to Drive..."
                              : `Download to Google Drive (${selectedQuality === "420p" ? "~400 MB" : "~1 GB"})`}
                          </span>
                        </button>

                        <a
                          href={`/api/download-file?url=${encodeURIComponent(archiveMp4Url)}&filename=${encodeURIComponent(`${downloadModalMovie.Title}.mp4`)}&quality=${selectedQuality}`}
                          download={`${downloadModalMovie.Title}_${selectedQuality}.mp4`}
                          onClick={() =>
                            setDriveSaveMessage({
                              text: `Starting direct ${selectedQuality} MP4 download to your device...`,
                            })
                          }
                          className="py-3 px-4 bg-green-600/25 hover:bg-green-600 border border-green-500/40 text-green-200 hover:text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>Save to Device ({selectedQuality})</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Option 2: Recommended Movie Download -> Google Drive Primary */}
                  {movieTorrents.length > 0 && (() => {
                    const recommended = getRecommendedTorrent(movieTorrents, selectedQuality);
                    const recMagnet = recommended ? buildMagnetLink(recommended.hash, downloadModalMovie.Title) : "";
                    const isRecCopied = recommended && copiedMagnet === recommended.hash;
                    const compactTorrents = movieTorrents.filter(
                      (t) => parseSizeToMb(t.size, t.size_bytes) <= 2300 && String(t.quality || "").toLowerCase() !== "2160p"
                    );
                    const hiddenLargeCount = movieTorrents.length - compactTorrents.length;
                    const displayedTorrents = showAllTorrents ? movieTorrents : (compactTorrents.length > 0 ? compactTorrents : movieTorrents.slice(0, 2));

                    return (
                      <div className="space-y-4">
                        {recommended && (
                          <div className="p-4 bg-[#19202e] rounded-2xl border border-blue-500/45 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold text-[11px] uppercase">
                                  Recommended • {selectedQuality === "420p" ? "420p (~400 MB)" : "1080p (~1 GB)"}
                                </span>
                                <span className="text-sm font-extrabold text-white">
                                  {recommended.quality} {recommended.type} ({recommended.size})
                                </span>
                              </div>
                              <span className="text-[11px] text-green-400 font-bold">
                                Seeds: {recommended.seeds}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={savingToDrive}
                              onClick={() =>
                                handleSaveToDrive({
                                  quality: selectedQuality,
                                  torrentUrl: recommended.url || null,
                                  magnetUrl: recMagnet,
                                  sourceSizeLabel: recommended.size,
                                })
                              }
                              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 cursor-pointer"
                            >
                              {savingToDrive ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <HardDrive className="w-4 h-4" />
                              )}
                              <span>
                                {savingToDrive
                                  ? "Downloading into Google Drive..."
                                  : `Download ${selectedQuality === "420p" ? "420p (~400 MB)" : "1080p (~1 GB)"} to Google Drive`}
                              </span>
                            </button>

                            <p className="text-[11px] text-blue-200/80">
                              Transfers the movie directly into your Google Drive account ({driveEmail || DEFAULT_GOOGLE_DRIVE_EMAIL}) and lets you open it inside the Google Drive app or cancel anytime.
                            </p>

                            <div className="pt-1 border-t border-white/10">
                              <button
                                type="button"
                                onClick={() => setShowOtherDownloadOptions((v) => !v)}
                                className="text-[11px] text-gray-400 hover:text-gray-200 font-semibold underline"
                              >
                                {showOtherDownloadOptions ? "Hide 1DM / Torrent App Options" : "Other Download Options (1DM / Torrent App / Copy Link)"}
                              </button>

                              {showOtherDownloadOptions && (
                                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                  <a
                                    href={recMagnet}
                                    className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/35 border border-green-500/35 text-green-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                                    title="Requires 1DM, uTorrent, or BitTorrent installed"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Open in Torrent App (1DM)</span>
                                  </a>
                                  <a
                                    href={`https://instant.io/#${encodeURIComponent(recMagnet)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                                  >
                                    <Globe className="w-3.5 h-3.5" />
                                    <span>Web Cloud Player</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMagnet(recMagnet, recommended.hash)}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                                  >
                                    {isRecCopied ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-green-400" />
                                        <span className="text-green-400">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy Magnet Link</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs flex items-start gap-2">
                          <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <p className="text-gray-300 text-[11px] leading-relaxed">
                            Oversized 4K / multi-GB files are hidden by default to protect your mobile data. Tap{' '}
                            <strong className="text-blue-300">Download to Google Drive</strong> to transfer this movie straight to your{' '}
                            <strong className="text-white">GlobalNews Movies</strong> folder.
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5 text-blue-400" />
                            <span>Available Compact Editions</span>
                          </h4>
                          {hiddenLargeCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllTorrents((v) => !v)}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline"
                            >
                              {showAllTorrents
                                ? "Hide Larger (>2.2 GB) Files"
                                : `Show ${hiddenLargeCount} larger HD/4K file${hiddenLargeCount === 1 ? "" : "s"}`}
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {displayedTorrents.map((t, idx) => {
                            const magnet = buildMagnetLink(t.hash, downloadModalMovie.Title);
                            const isCopied = copiedMagnet === t.hash;
                            const isCompact420Match = parseSizeToMb(t.size, t.size_bytes) <= 950;
                            const targetTier: MovieQualityTier = isCompact420Match ? "420p" : "1080p";
                            return (
                              <div 
                                key={idx}
                                className="p-3.5 bg-[#1c1c1c] rounded-2xl border border-white/5 hover:border-white/15 transition-all space-y-2.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-bold text-xs uppercase">
                                      {t.quality} {t.type}
                                    </span>
                                    <span className="text-xs font-extrabold text-white bg-white/10 px-2 py-0.5 rounded-md">
                                      {t.size}
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {isCompact420Match ? "Data-Saver (420p)" : "Clear HD (1080p)"}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-gray-400">
                                    Seeds: <span className="text-green-400 font-bold">{t.seeds}</span>
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={savingToDrive}
                                    onClick={() =>
                                      handleSaveToDrive({
                                        quality: targetTier,
                                        torrentUrl: t.url || null,
                                        magnetUrl: magnet,
                                        sourceSizeLabel: t.size,
                                      })
                                    }
                                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow"
                                  >
                                    {savingToDrive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                                    <span>Download to Drive ({targetTier})</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleCopyMagnet(magnet, t.hash)}
                                    className="px-2.5 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-semibold flex items-center gap-1"
                                  >
                                    {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{isCopied ? "Copied" : "Copy Link"}</span>
                                  </button>

                                  <a
                                    href={`/api/download-file?url=${encodeURIComponent(t.url)}&filename=${encodeURIComponent(`${downloadModalMovie.Title}_${t.quality}.torrent`)}`}
                                    download={`${downloadModalMovie.Title}_${t.quality}.torrent`}
                                    className="px-2.5 py-2 text-gray-400 hover:text-white text-[11px] underline ml-auto"
                                  >
                                    .torrent file
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {!archiveMp4Url && movieTorrents.length === 0 && (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-gray-300 text-sm font-medium">
                        No direct torrent or MP4 seed found for this specific title.
                      </p>
                      <p className="text-xs text-gray-500">
                        Use the external repositories below to locate the movie file.
                      </p>
                    </div>
                  )}

                  {/* Fallback / External Search Options */}
                  <div className="pt-2 border-t border-white/5 space-y-2.5">
                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Additional File Sources
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`https://archive.org/search.php?query=${encodeURIComponent(downloadModalMovie.Title)}&and[]=mediatype%3A%22movies%22`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Search Internet Archive Files</span>
                        <ExternalLink className="w-3 h-3 text-gray-500" />
                      </a>
                      <a
                        href={`https://thepiratebay.org/search.php?q=${encodeURIComponent(downloadModalMovie.Title)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Search The Pirate Bay</span>
                        <ExternalLink className="w-3 h-3 text-gray-500" />
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#1a1a1a] border-t border-white/10 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">
                Save to <strong className="text-gray-200">Google Drive</strong> or download straight to your device.
              </span>
              <button
                onClick={() => setDownloadModalMovie(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit React Confirmation Modal when overwriting an existing file in Google Drive */}
      <DriveOverwriteConfirmModal
        isOpen={Boolean(pendingOverwrite)}
        fileName={pendingOverwrite?.fileName || ""}
        existingFile={pendingOverwrite?.existingFile}
        isSaving={savingToDrive}
        onCancel={() => setPendingOverwrite(null)}
        onConfirmOverwrite={() => {
          if (pendingOverwrite?.existingFile?.id) {
            handleSaveToDrive(pendingOverwrite.payload, pendingOverwrite.existingFile.id);
          }
        }}
      />

      <div className="mb-6 lg:hidden flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src="/logo.png" 
            alt="GNS Logo" 
            className="h-10 w-10 object-contain rounded-lg cursor-pointer"
            title="Double click to download logo"
            onDoubleClick={() => {
              const link = document.createElement('a');
              link.href = '/logo.png';
              link.download = 'logo.png';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          />
          <h1 className="text-lg font-bold text-white m-0 tracking-tight">Global News Site</h1>
        </div>
      </div>

      <form onSubmit={searchMovies} className="mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search for movies or shows..."
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  fetchRecentMovies(sortMode);
                }
              }}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-full py-3 pl-12 pr-4 text-white focus:outline-none focus:border-white/30 transition-colors"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchQuery.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors disabled:opacity-50 text-white font-medium flex-shrink-0"
          >
            Search
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        {!searchQuery ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSortMode("popular");
                fetchRecentMovies("popular", englishOnly);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                sortMode === "popular"
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              Popular Movies
            </button>
            <button
              type="button"
              onClick={() => {
                setSortMode("latest");
                fetchRecentMovies("latest", englishOnly);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                sortMode === "latest"
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              Latest Additions
            </button>
          </div>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={() => {
            const next = !englishOnly;
            setEnglishOnly(next);
            if (!searchQuery.trim()) {
              fetchRecentMovies(sortMode, next);
            } else {
              searchMovies(undefined, next);
            }
          }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors border ${
            englishOnly
              ? "bg-green-600/20 border-green-500/40 text-green-300"
              : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
          title="Filter movies to English spoken audio"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{englishOnly ? "English Spoken: ON" : "All Languages"}</span>
        </button>
      </div>

      {/* Google Drive Cloud Integration Bar */}
      <GoogleDriveSection
        compact
        refreshTrigger={driveRefreshTrigger}
        onTokenChange={(tok, email) => {
          setDriveToken(tok);
          setDriveEmail(email);
        }}
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm font-medium text-gray-400">Searching...</p>
        </div>
      )}

      {!isLoading && movies.length === 0 && searchQuery && (
        <div className="text-center py-20 text-gray-400">
          {searchError ? (
            <span className="text-red-400">{searchError}</span>
          ) : (
            `No results found for "${searchQuery}".`
          )}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-6">
          {movies.map((movie) => (
            <article
              key={movie.imdbID}
              id={`movie-article-${movie.imdbID}`}
              className="bg-[#1a1a1a] rounded-3xl overflow-hidden border border-white/5 transition-all hover:border-white/10"
            >
              <div className="relative w-full flex flex-col group overflow-hidden bg-black rounded-t-3xl">
                <div className="relative w-full aspect-video flex items-center justify-center">
                  {playingMovieId === movie.imdbID ? (
                    useDirectMp4[movie.imdbID] && directUrls[movie.imdbID] ? (
                      <NativeVideoPlayer
                        src={directUrls[movie.imdbID]}
                        poster={movie.Poster !== "N/A" ? movie.Poster : undefined}
                      />
                    ) : (
                      <CleanVideoPlayer
                        id={`video-iframe-${movie.imdbID}`}
                        src={SERVERS.find(s => s.id === playerServerId)?.url(movie.Type, movie.imdbID) || SERVERS[0].url(movie.Type, movie.imdbID)}
                        serverName={SERVERS.find(s => s.id === playerServerId)?.name}
                        onNextServer={handleSwitchToNextServer}
                      />
                    )
                  ) : playingTrailerMovieId === movie.imdbID ? (
                    loadingTrailers[movie.imdbID] ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    ) : trailerInfoMap[movie.imdbID]?.embedUrl ? (
                      <iframe
                        src={trailerInfoMap[movie.imdbID].embedUrl!}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen={true}
                        title={`${movie.Title} Official Trailer`}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-black">
                        <Video className="w-10 h-10 text-red-500" />
                        <p className="text-xs text-gray-300">Inline embed unavailable for this title.</p>
                        <a
                          href={trailerInfoMap[movie.imdbID]?.watchUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${movie.Title} ${movie.Year} official trailer`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Watch Trailer on YouTube</span>
                        </a>
                      </div>
                    )
                  ) : (
                    <>
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(
                          movie.Poster !== "N/A"
                            ? movie.Poster
                            : "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=800"
                        )}`}
                        alt={movie.Title}
                        className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                        crossOrigin="anonymous"
                      />
                      <button
                        onClick={() => handlePlayMovie(movie)}
                        className="absolute inset-0 flex items-center justify-center no-capture"
                      >
                        <div className="w-16 h-16 bg-blue-600/90 backdrop-blur-md rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-blue-900/50">
                          <Play className="w-8 h-8 text-white fill-white ml-1" />
                        </div>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayTrailer(movie, false);
                        }}
                        className="absolute bottom-4 right-4 px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-red-600 border border-white/20 hover:border-red-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-lg backdrop-blur-md"
                        disabled={loadingTrailers[movie.imdbID]}
                      >
                        {loadingTrailers[movie.imdbID] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Video className="w-3.5 h-3.5 text-red-400 group-hover:text-white" />
                        )}
                        <span>{loadingTrailers[movie.imdbID] ? "Loading..." : "Watch Trailer"}</span>
                      </button>
                    </>
                  )}
                </div>
                {playingMovieId === movie.imdbID && (
                  <>
                  <div className="p-3 bg-[#111] border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-gray-400 font-medium">Server:</span>
                        <div className="flex flex-wrap gap-2">
                          {SERVERS.map((server) => (
                            <button
                              key={server.id}
                              onClick={() => {
                                setUseDirectMp4(prev => ({ ...prev, [movie.imdbID]: false }));
                                setPlayerServerId(server.id);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                !useDirectMp4[movie.imdbID] && playerServerId === server.id
                                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
                                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                              }`}
                            >
                              {server.name}
                            </button>
                          ))}
                          {directUrls[movie.imdbID] && (
                            <button
                              onClick={() => setUseDirectMp4(prev => ({ ...prev, [movie.imdbID]: !prev[movie.imdbID] }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                useDirectMp4[movie.imdbID]
                                  ? "bg-green-600 text-white shadow-md shadow-green-900/20"
                                  : "bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30"
                              }`}
                            >
                              Ad-Free MP4
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const iframe = document.getElementById(`video-iframe-${movie.imdbID}`);
                          if (iframe) {
                            if (iframe.requestFullscreen) iframe.requestFullscreen();
                            else if ((iframe as any).webkitRequestFullscreen) (iframe as any).webkitRequestFullscreen();
                            else if ((iframe as any).msRequestFullscreen) (iframe as any).msRequestFullscreen();
                          }
                        }}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 shadow-lg border border-white/10 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all transform hover:scale-105"
                        title="Enter Full HD Screen Mode"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                        Full HD Screen
                      </button>
                      <a
                        href={SERVERS.find(s => s.id === playerServerId)?.url(movie.Type, movie.imdbID) || SERVERS[0].url(movie.Type, movie.imdbID)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all transform hover:scale-105"
                        title="Open player in new tab if it doesn't load"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Open in New Tab
                      </a>
                      <button
                        onClick={() => handleOpenDownloadModal(movie)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all transform hover:scale-105 cursor-pointer"
                        title="Download Movie to File"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Files</span>
                      </button>
                    </div>
                  </div>
                  </>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 text-xs font-medium text-gray-400 mb-3 tracking-wide flex-wrap">
                  <span className="flex items-center gap-1.5 text-blue-400 uppercase tracking-wider">
                    <Film className="w-3.5 h-3.5" />
                    {movie.Type}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {movie.Year}
                  </span>
                  {movie.Language && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-green-400 font-semibold">
                        <Globe className="w-3 h-3" />
                        {movie.Language.split(',')[0].trim()} Audio
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-bold mb-1 leading-snug text-white">
                    {movie.Title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => handlePlayMovie(movie)}
                    className={`px-4 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 ${
                      playingMovieId === movie.imdbID
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-blue-400"
                        : "bg-white/5 hover:bg-blue-600 text-gray-200 hover:text-white border border-white/10 hover:border-blue-500"
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{playingMovieId === movie.imdbID ? "Playing Movie..." : "Watch Full Movie"}</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePlayTrailer(movie, false);
                    }}
                    className="px-4 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-xs transition-all flex items-center gap-2"
                    disabled={loadingTrailers[movie.imdbID]}
                  >
                    {loadingTrailers[movie.imdbID] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Video className="w-3.5 h-3.5" />
                    )}
                    <span>{loadingTrailers[movie.imdbID] ? "Loading..." : "Official Trailer"}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (playingTrailerMovieId === movie.imdbID) {
                        setPlayingTrailerMovieId(null);
                      } else {
                        handlePlayTrailer(movie, true);
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 ${
                      playingTrailerMovieId === movie.imdbID
                        ? "bg-red-600 text-white shadow-lg ring-2 ring-red-400"
                        : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10"
                    }`}
                    title="Play Trailer inline in player"
                    disabled={loadingTrailers[movie.imdbID]}
                  >
                    {loadingTrailers[movie.imdbID] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>{playingTrailerMovieId === movie.imdbID ? "Close Trailer" : "Inline Trailer"}</span>
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenDownloadModal(movie)}
                    className="px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 border border-blue-500/40 text-blue-200 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Download Blurry 420p (~400MB) or Clear 1080p (~1GB) to Google Drive"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download (420p / 1080p • Drive)</span>
                  </button>

                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

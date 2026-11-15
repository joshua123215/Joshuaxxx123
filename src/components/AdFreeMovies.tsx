import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Play,
  Film,
  Database,
  ShieldCheck,
  Download,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Ban,
} from 'lucide-react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, DEFAULT_GOOGLE_DRIVE_EMAIL } from '../lib/firebase';
import NativeVideoPlayer from './NativeVideoPlayer';
import { isAdminUser } from '../utils/subscription';
import { User } from 'firebase/auth';
import GoogleDriveSection, { DriveOverwriteConfirmModal } from './GoogleDriveSection';
import {
  DEFAULT_DRIVE_URL,
  DriveSavedFile,
  DriveSaveProgress,
  MovieQualityTier,
  connectGoogleDriveAccount,
  getDriveAccessToken,
  openUrlViaAnchor,
  saveMovieToGoogleDrive,
} from '../utils/googleDrive';
import {
  cancelTrackedDriveJob,
  patchTrackedDriveJob,
  upsertTrackedDriveJob,
} from '../utils/driveJobStore';

interface AdFreeMovie {
  id: string;
  title: string;
  poster_url: string;
  video_url: string;
  description?: string;
}

interface AdFreeMoviesProps {
  user?: User | null;
}

const VERIFIED_ARCHIVE_VIDEO_URLS: Record<string, string> = {
  night_of_the_living_dead: "https://archive.org/download/night_of_the_living_dead_dvd/Night.mp4",
  house_on_haunted_hill: "https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill.mp4",
  plan_9_from_outer_space: "https://archive.org/download/774-plan-9-from-outer-space/774-Plan9FromOuterSpace.mp4",
};

const INITIAL_MOCK_DATA = [
  {
    id: "night_of_the_living_dead",
    title: "Night of the Living Dead",
    poster_url: "https://archive.org/download/night_of_the_living_dead_dvd/night_of_the_living_dead_dvd.thumbs/Night_000300.jpg",
    video_url: VERIFIED_ARCHIVE_VIDEO_URLS.night_of_the_living_dead,
    description: "The dead come back to life and eat the living in this low budget, black and white film..."
  },
  {
    id: "house_on_haunted_hill",
    title: "House on Haunted Hill",
    poster_url: "https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill_ipod.thumbs/house_on_haunted_hill_000300.jpg",
    video_url: VERIFIED_ARCHIVE_VIDEO_URLS.house_on_haunted_hill,
    description: "A millionaire offers $10,000 to five people who agree to be locked in a large, spooky, rented house overnight."
  },
  {
    id: "plan_9_from_outer_space",
    title: "Plan 9 from Outer Space",
    poster_url: "https://archive.org/download/774-plan-9-from-outer-space/774-plan-9-from-outer-space.thumbs/774-Plan9FromOuterSpace_000300.jpg",
    video_url: VERIFIED_ARCHIVE_VIDEO_URLS.plan_9_from_outer_space,
    description: "Evil aliens attack Earth and set their terrible Plan 9 into action. As the aliens resurrect the dead of the Earth, the lives of the living are in danger."
  }
];

export default function AdFreeMovies({ user }: AdFreeMoviesProps) {
  const [movies, setMovies] = useState<AdFreeMovie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingMovie, setPlayingMovie] = useState<AdFreeMovie | null>(null);
  const isAdmin = isAdminUser(user);

  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveRefreshTrigger, setDriveRefreshTrigger] = useState<number>(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCancellingDrive, setIsCancellingDrive] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeFolderUrl, setActiveFolderUrl] = useState<string | null>(null);
  const [autoOpenDrive, setAutoOpenDrive] = useState<boolean>(true);
  const [driveProgress, setDriveProgress] = useState<DriveSaveProgress | null>(null);
  const [driveFeedback, setDriveFeedback] = useState<{ type: 'success' | 'error'; text: string; link?: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    movie: AdFreeMovie;
    quality: MovieQualityTier;
    fileName: string;
    existingFile?: DriveSavedFile | null;
  } | null>(null);

  useEffect(() => {
    fetchMovies();
  }, []);

  const fetchMovies = async () => {
    setIsLoading(true);
    try {
      const moviesCol = collection(db, 'movies');
      const movieSnapshot = await getDocs(moviesCol);
      
      if (movieSnapshot.empty) {
        for (const movie of INITIAL_MOCK_DATA) {
          await setDoc(doc(db, 'movies', movie.id), movie).catch(() => {});
        }
        setMovies(INITIAL_MOCK_DATA);
      } else {
        const movieList = movieSnapshot.docs.map(d => {
          const item = d.data() as AdFreeMovie;
          if (VERIFIED_ARCHIVE_VIDEO_URLS[item.id] && item.video_url !== VERIFIED_ARCHIVE_VIDEO_URLS[item.id]) {
            const matchingMock = INITIAL_MOCK_DATA.find(m => m.id === item.id);
            const upgraded = {
              ...item,
              video_url: VERIFIED_ARCHIVE_VIDEO_URLS[item.id],
              poster_url: matchingMock?.poster_url || item.poster_url,
            };
            setDoc(doc(db, 'movies', item.id), upgraded).catch(() => {});
            return upgraded;
          }
          return item;
        });
        setMovies(movieList);
      }
    } catch (error) {
      console.error("Error fetching movies from Firestore:", error);
      setMovies(INITIAL_MOCK_DATA);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMovieClick = (movie: AdFreeMovie) => {
    setPlayingMovie(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelDriveDownload = async () => {
    setIsCancellingDrive(true);
    try {
      abortControllerRef.current?.abort();
      if (activeJobId) {
        await cancelTrackedDriveJob(activeJobId);
      }
      setDriveProgress(null);
      setSavingId(null);
      setActiveJobId(null);
      setDriveFeedback({
        type: 'success',
        text: 'Download cancelled.',
        link: activeFolderUrl || DEFAULT_DRIVE_URL,
      });
    } finally {
      setIsCancellingDrive(false);
    }
  };

  const handleSaveToDrive = async (
    movie: AdFreeMovie,
    quality: MovieQualityTier,
    overwriteExistingFileId?: string
  ) => {
    setDriveFeedback(null);
    let token = driveToken || getDriveAccessToken();
    if (!token) {
      try {
        const res = await connectGoogleDriveAccount(DEFAULT_GOOGLE_DRIVE_EMAIL);
        token = res.accessToken;
        setDriveToken(token);
        setDriveEmail(res.user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
        setDriveRefreshTrigger((v) => v + 1);
      } catch (err: any) {
        setDriveFeedback({
          type: 'error',
          text: err?.message || 'Google Drive connection is required to save movies.',
        });
        return;
      }
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let startedJobId: string | null = null;
    setActiveJobId(null);
    const opKey = `${movie.id}_${quality}`;
    setSavingId(opKey);
    setDriveProgress({
      status: 'queued',
      progressPercent: 4,
      message: `Preparing "${movie.title}" (${quality === '420p' ? '420p ~400 MB' : '1080p ~1 GB'}) for Google Drive...`,
    });
    try {
      const result = await saveMovieToGoogleDrive({
        accessToken: token,
        title: movie.title,
        quality,
        videoUrl: movie.video_url,
        sourceSizeLabel: quality === '420p' ? '~400 MB' : '~1 GB',
        overwriteExistingFileId,
        signal: controller.signal,
        onJobCreated: (info) => {
          startedJobId = info.jobId;
          setActiveJobId(info.jobId);
          if (info.folderUrl) setActiveFolderUrl(info.folderUrl);
          upsertTrackedDriveJob({
            jobId: info.jobId,
            jobKey: info.jobKey,
            title: info.title,
            quality: info.quality,
            targetFileName: info.targetFileName,
            status: 'queued',
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

      if (result.status === 'cancelled' || controller.signal.aborted) {
        if (startedJobId) {
          patchTrackedDriveJob(startedJobId, {
            status: 'cancelled',
            message: 'Download cancelled by user.',
          });
        }
        setDriveProgress(null);
        setActiveJobId(null);
        setDriveFeedback({
          type: 'success',
          text: 'Download cancelled.',
          link: result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL,
        });
        return;
      }

      if (result.status === 'duplicate') {
        setDriveProgress(null);
        setActiveJobId(null);
        if (result.folderUrl) setActiveFolderUrl(result.folderUrl);
        setPendingOverwrite({
          movie,
          quality,
          fileName: result.targetFileName || movie.title,
          existingFile: result.existingFile,
        });
        return;
      }

      setPendingOverwrite(null);
      setDriveProgress(null);
      setActiveJobId(null);
      setDriveRefreshTrigger((v) => v + 1);
      const targetLink = result.file?.webViewLink || result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL;
      if (startedJobId) {
        patchTrackedDriveJob(startedJobId, {
          status: 'completed',
          progressPercent: 100,
          message: `Saved "${result.file?.name || movie.title}" (${quality === '420p' ? '420p ~400 MB' : '1080p ~1 GB'}) to Google Drive!`,
          folderUrl: result.folderUrl || activeFolderUrl || DEFAULT_DRIVE_URL,
          file: result.file,
        });
      }
      setDriveFeedback({
        type: 'success',
        text: `Downloaded "${result.file?.name || movie.title}" (${quality === '420p' ? '420p ~400 MB' : '1080p ~1 GB'}) to Google Drive (${driveEmail || DEFAULT_GOOGLE_DRIVE_EMAIL}).`,
        link: targetLink,
      });

      if (autoOpenDrive && targetLink) {
        openUrlViaAnchor(targetLink);
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        if (startedJobId) {
          patchTrackedDriveJob(startedJobId, {
            status: 'cancelled',
            message: 'Download cancelled by user.',
          });
        }
        setDriveProgress(null);
        setActiveJobId(null);
        setDriveFeedback({ type: 'success', text: 'Download cancelled.' });
        return;
      }
      setDriveProgress(null);
      setActiveJobId(null);
      const msg = err?.message || 'Failed to save movie to Google Drive.';
      if (startedJobId) {
        patchTrackedDriveJob(startedJobId, {
          status: 'failed',
          message: msg,
        });
      }
      setDriveFeedback({ type: 'error', text: msg });
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('reconnect')) {
        setDriveToken(null);
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="w-full pb-10">
      <div className="bg-[#111] border-b border-white/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
              <Database className="w-8 h-8 text-green-500" />
              Ad-Free Archive
            </h2>
            {isAdmin && (
              <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-full text-xs font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </span>
            )}
          </div>
          <p className="text-gray-400 mt-2 text-sm max-w-2xl">
            Stream clean `.mp4` classics, download in <strong className="text-green-300">Blurry 420p (~400 MB)</strong> or <strong className="text-blue-300">Clear 1080p (~1 GB)</strong>, or save straight to your Google Drive.
          </p>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto mt-4 space-y-6">
        <GoogleDriveSection
          compact
          refreshTrigger={driveRefreshTrigger}
          onTokenChange={(tok, email) => {
            setDriveToken(tok);
            setDriveEmail(email);
          }}
        />

        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none px-1">
          <input
            type="checkbox"
            checked={autoOpenDrive}
            onChange={(e) => setAutoOpenDrive(e.target.checked)}
            className="rounded border-white/20 bg-black/50 text-blue-500 focus:ring-blue-500"
          />
          <span>Automatically take me to my Google Drive app when download completes</span>
        </label>

        {driveProgress && (
          <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/35 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-blue-200">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>{driveProgress.message}</span>
              </span>
              <span>{driveProgress.progressPercent}%</span>
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
                <span>{isCancellingDrive ? 'Cancelling...' : 'Cancel Download'}</span>
              </button>
            </div>
          </div>
        )}

        {driveFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              driveFeedback.type === 'success'
                ? 'bg-green-500/15 border-green-500/30 text-green-200'
                : 'bg-red-500/15 border-red-500/30 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {driveFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{driveFeedback.text}</span>
            </div>
            {driveFeedback.link && (
              <a
                href={driveFeedback.link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold text-[11px] flex items-center gap-1 self-start sm:self-center"
              >
                <span>Open in Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {playingMovie && (
          <div className="mb-8 bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 p-1">
            <div className="flex items-center justify-between p-4 pb-2 border-b border-white/10 mb-2 gap-3 flex-wrap">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-green-500 fill-current" />
                Now Playing: {playingMovie.title}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`/api/download-file?url=${encodeURIComponent(playingMovie.video_url)}&filename=${encodeURIComponent(playingMovie.title + '.mp4')}&quality=420p`}
                  download={`${playingMovie.title}_420p.mp4`}
                  className="px-3.5 py-2 bg-green-600 hover:bg-green-500 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>420p (~400 MB)</span>
                </a>
                <a
                  href={`/api/download-file?url=${encodeURIComponent(playingMovie.video_url)}&filename=${encodeURIComponent(playingMovie.title + '.mp4')}&quality=1080p`}
                  download={`${playingMovie.title}_1080p.mp4`}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>1080p (~1 GB)</span>
                </a>
                <button
                  type="button"
                  disabled={savingId !== null}
                  onClick={() => handleSaveToDrive(playingMovie, '420p')}
                  className="px-3.5 py-2 bg-white/10 hover:bg-blue-600 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                >
                  {savingId === `${playingMovie.id}_420p` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5" />
                  )}
                  <span>Save 420p to Drive</span>
                </button>
                <button
                  type="button"
                  disabled={savingId !== null}
                  onClick={() => handleSaveToDrive(playingMovie, '1080p')}
                  className="px-3.5 py-2 bg-white/10 hover:bg-blue-600 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                >
                  {savingId === `${playingMovie.id}_1080p` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5" />
                  )}
                  <span>Save 1080p to Drive</span>
                </button>
                <button 
                  onClick={() => setPlayingMovie(null)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-medium transition-colors"
                >
                  Close Player
                </button>
              </div>
            </div>
            <div className="aspect-video w-full bg-black rounded-b-2xl overflow-hidden">
              <NativeVideoPlayer 
                src={playingMovie.video_url} 
                poster={playingMovie.poster_url} 
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
            <p className="text-gray-400 font-medium">Fetching clean sources from database...</p>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Film className="w-5 h-5 text-gray-400" />
              Direct Database Streams
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {movies.map((movie) => (
                <div 
                  key={movie.id} 
                  className="bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-lg border border-white/5 hover:border-green-500/30 transition-all duration-300 group cursor-pointer flex flex-col"
                  onClick={() => handleMovieClick(movie)}
                >
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <img 
                      src={movie.poster_url} 
                      alt={movie.title} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 text-white fill-current ml-1" />
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors line-clamp-1">
                        {movie.title}
                      </h4>
                      {movie.description && (
                        <p className="text-gray-400 text-sm mt-2 line-clamp-2">
                          {movie.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => handleSaveToDrive(movie, '420p')}
                          className="px-2.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50 shadow"
                        >
                          {savingId === `${movie.id}_420p` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5" />
                          )}
                          <span>Drive 420p (~400 MB)</span>
                        </button>
                        <button
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => handleSaveToDrive(movie, '1080p')}
                          className="px-2.5 py-2.5 bg-blue-600/80 hover:bg-blue-500 text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50 shadow"
                        >
                          {savingId === `${movie.id}_1080p` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5" />
                          )}
                          <span>Drive 1080p (~1 GB)</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`/api/download-file?url=${encodeURIComponent(movie.video_url)}&filename=${encodeURIComponent(movie.title + '.mp4')}&quality=420p`}
                          download={`${movie.title}_420p.mp4`}
                          onClick={() =>
                            setDriveFeedback({
                              type: 'success',
                              text: `Starting 420p download for "${movie.title}" to your device...`,
                            })
                          }
                          className="px-2.5 py-2 bg-green-600/20 hover:bg-green-600 border border-green-500/30 text-green-300 hover:text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Device 420p</span>
                        </a>
                        <a
                          href={`/api/download-file?url=${encodeURIComponent(movie.video_url)}&filename=${encodeURIComponent(movie.title + '.mp4')}&quality=1080p`}
                          download={`${movie.title}_1080p.mp4`}
                          onClick={() =>
                            setDriveFeedback({
                              type: 'success',
                              text: `Starting 1080p download for "${movie.title}" to your device...`,
                            })
                          }
                          className="px-2.5 py-2 bg-white/5 hover:bg-green-600 border border-white/10 text-gray-200 hover:text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Device 1080p</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DriveOverwriteConfirmModal
        isOpen={Boolean(pendingOverwrite)}
        fileName={pendingOverwrite?.fileName || ''}
        existingFile={pendingOverwrite?.existingFile}
        isSaving={savingId !== null}
        onCancel={() => setPendingOverwrite(null)}
        onConfirmOverwrite={() => {
          if (pendingOverwrite?.existingFile?.id) {
            handleSaveToDrive(
              pendingOverwrite.movie,
              pendingOverwrite.quality,
              pendingOverwrite.existingFile.id
            );
          }
        }}
      />
    </div>
  );
}


import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider, DEFAULT_GOOGLE_DRIVE_EMAIL } from '../lib/firebase';

export type MovieQualityTier = '420p' | '1080p';

export interface DriveSavedFile {
  id: string;
  name: string;
  size?: string;
  mimeType?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  description?: string;
}

// In-memory cache ONLY (never stored in localStorage or sessionStorage)
let cachedDriveAccessToken: string | null = null;
let isSigningIn = false;

export const setDriveAccessToken = (token: string | null) => {
  cachedDriveAccessToken = token || null;
};

export const getDriveAccessToken = (): string | null => {
  return cachedDriveAccessToken;
};

export const clearDriveAccessToken = () => {
  cachedDriveAccessToken = null;
};

export const initDriveAuth = (
  onAuthReady?: (user: User, token: string) => void,
  onAuthCleared?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedDriveAccessToken) {
      onAuthReady?.(user, cachedDriveAccessToken);
    } else {
      if (!user) {
        cachedDriveAccessToken = null;
      }
      if (!isSigningIn) {
        onAuthCleared?.(user);
      }
    }
  });
};

export const connectGoogleDriveAccount = async (
  hintEmail: string = DEFAULT_GOOGLE_DRIVE_EMAIL
): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({
      login_hint: hintEmail,
      prompt: 'select_account consent',
      include_granted_scopes: 'true',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Drive permission token. Please try signing in again.');
    }
    cachedDriveAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedDriveAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const DEFAULT_DRIVE_URL = 'https://drive.google.com/drive/my-drive';

export const openUrlViaAnchor = (url: string) => {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // fallback silently; prominent visible link remains clickable in UI
  }
};

export interface DriveFolderListing {
  folderId: string | null;
  folderUrl: string | null;
  files: DriveSavedFile[];
}

export const listGoogleDriveFolderAndMovies = async (
  accessToken: string
): Promise<DriveFolderListing> => {
  const res = await fetch('/api/drive/files', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    clearDriveAccessToken();
    throw new Error('Google Drive session expired. Please reconnect your Google account.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load files from Google Drive');
  }

  const data = await res.json();
  return {
    folderId: data.folderId || null,
    folderUrl: data.folderUrl || (data.folderId ? `https://drive.google.com/drive/folders/${data.folderId}` : null),
    files: Array.isArray(data.files) ? data.files : [],
  };
};

export const listGoogleDriveMovies = async (accessToken: string): Promise<DriveSavedFile[]> => {
  const { files } = await listGoogleDriveFolderAndMovies(accessToken);
  return files;
};

export interface DriveSaveProgress {
  status: 'queued' | 'downloading' | 'transcoding' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  message: string;
  jobId?: string;
  folderUrl?: string;
}

export interface SaveMovieToDriveResult {
  status: 'saved' | 'duplicate' | 'cancelled';
  file?: DriveSavedFile;
  existingFile?: DriveSavedFile;
  targetFileName?: string;
  folderId?: string;
  folderUrl?: string;
  mode?: 'video' | 'torrent' | 'cloud-link';
  message?: string;
}

export const cancelGoogleDriveJob = async (
  accessToken: string | null | undefined,
  jobId: string,
  jobKey?: string
): Promise<{ status: string; message?: string }> => {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (jobKey) headers['x-job-key'] = jobKey;

  const res = await fetch(`/api/drive/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 404) {
    throw new Error(data.error || 'Failed to cancel Google Drive download.');
  }
  return data;
};

const waitWithAbort = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve();
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const saveMovieToGoogleDrive = async (params: {
  accessToken: string;
  title: string;
  year?: string;
  imdbId?: string;
  quality: MovieQualityTier;
  videoUrl?: string | null;
  torrentUrl?: string | null;
  magnetUrl?: string | null;
  sourceSizeLabel?: string;
  overwriteExistingFileId?: string;
  signal?: AbortSignal;
  onJobCreated?: (info: {
    jobId: string;
    jobKey?: string;
    title: string;
    quality: MovieQualityTier;
    targetFileName?: string;
    folderId?: string;
    folderUrl?: string;
  }) => void;
  onProgress?: (progress: DriveSaveProgress) => void;
}): Promise<SaveMovieToDriveResult> => {
  if (params.signal?.aborted) {
    return { status: 'cancelled', message: 'Download cancelled by user.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/drive/save-movie', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        title: params.title,
        year: params.year,
        imdbId: params.imdbId,
        quality: params.quality,
        videoUrl: params.videoUrl || null,
        torrentUrl: params.torrentUrl || null,
        magnetUrl: params.magnetUrl || null,
        sourceSizeLabel: params.sourceSizeLabel || null,
        overwriteExistingFileId: params.overwriteExistingFileId || null,
      }),
    });
  } catch (err: any) {
    if (params.signal?.aborted || err?.name === 'AbortError') {
      return { status: 'cancelled', message: 'Download cancelled by user.' };
    }
    throw err;
  }

  if (res.status === 401) {
    clearDriveAccessToken();
    throw new Error('Google Drive authorization expired. Please click "Sign in with Google" to reconnect.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save movie to Google Drive.');
  }

  if (data.status === 'duplicate' || data.status === 'saved') {
    return data as SaveMovieToDriveResult;
  }

  if (data.status === 'started' && data.jobId) {
    const jobId = String(data.jobId);
    const jobKey: string | undefined = data.jobKey || undefined;
    const folderId: string | undefined = data.folderId || undefined;
    const folderUrl: string | undefined =
      data.folderUrl || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : undefined);

    params.onJobCreated?.({
      jobId,
      jobKey,
      title: params.title,
      quality: params.quality,
      targetFileName: data.targetFileName,
      folderId,
      folderUrl,
    });

    params.onProgress?.({
      status: 'queued',
      progressPercent: 3,
      message: 'Starting server-to-Drive transfer (0 phone data used)...',
      jobId,
      folderUrl,
    });

    while (true) {
      if (params.signal?.aborted) {
        await cancelGoogleDriveJob(params.accessToken, jobId, jobKey).catch(() => {});
        return {
          status: 'cancelled',
          folderId,
          folderUrl,
          message: 'Download cancelled by user.',
        };
      }

      await waitWithAbort(1400, params.signal);

      if (params.signal?.aborted) {
        await cancelGoogleDriveJob(params.accessToken, jobId, jobKey).catch(() => {});
        return {
          status: 'cancelled',
          folderId,
          folderUrl,
          message: 'Download cancelled by user.',
        };
      }

      let jobRes: Response;
      try {
        const pollHeaders: Record<string, string> = {};
        if (params.accessToken) pollHeaders.Authorization = `Bearer ${params.accessToken}`;
        if (jobKey) pollHeaders['x-job-key'] = jobKey;

        jobRes = await fetch(`/api/drive/jobs/${encodeURIComponent(jobId)}`, {
          signal: params.signal,
          headers: pollHeaders,
        });
      } catch (err: any) {
        if (params.signal?.aborted || err?.name === 'AbortError') {
          await cancelGoogleDriveJob(params.accessToken, jobId, jobKey).catch(() => {});
          return {
            status: 'cancelled',
            folderId,
            folderUrl,
            message: 'Download cancelled by user.',
          };
        }
        throw err;
      }

      if (jobRes.status === 401) {
        clearDriveAccessToken();
        throw new Error('Google Drive authorization expired. Please reconnect your Google account.');
      }

      const jobData = await jobRes.json().catch(() => ({}));
      if (!jobRes.ok) {
        throw new Error(jobData.error || 'Lost track of Google Drive upload job.');
      }

      const resolvedFolderUrl = jobData.folderUrl || folderUrl;

      params.onProgress?.({
        status: jobData.status,
        progressPercent: typeof jobData.progressPercent === 'number' ? jobData.progressPercent : 0,
        message: jobData.message || 'Processing...',
        jobId,
        folderUrl: resolvedFolderUrl,
      });

      if (jobData.status === 'completed') {
        return {
          status: 'saved',
          mode: 'video',
          file: jobData.file,
          folderId: jobData.folderId || folderId,
          folderUrl: resolvedFolderUrl,
          message: jobData.message,
        };
      }

      if (jobData.status === 'cancelled') {
        return {
          status: 'cancelled',
          folderId: jobData.folderId || folderId,
          folderUrl: resolvedFolderUrl,
          message: jobData.message || 'Download cancelled by user.',
        };
      }

      if (jobData.status === 'failed') {
        throw new Error(jobData.error || jobData.message || 'Failed saving movie to Google Drive.');
      }
    }
  }

  return data as SaveMovieToDriveResult;
};

export const deleteGoogleDriveMovie = async (
  accessToken: string,
  fileId: string
): Promise<void> => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    clearDriveAccessToken();
    throw new Error('Google Drive authorization expired. Please reconnect your Google account.');
  }

  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to delete file from Google Drive.');
  }
};

export const formatBytes = (bytes?: string | number | null): string => {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : typeof bytes === 'number' ? bytes : 0;
  if (!n || Number.isNaN(n)) return 'Ready';
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

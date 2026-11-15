import { DEFAULT_DRIVE_URL, DriveSavedFile, MovieQualityTier, cancelGoogleDriveJob, getDriveAccessToken } from './googleDrive';

export interface TrackedDriveJob {
  jobId: string;
  jobKey?: string;
  title: string;
  quality: MovieQualityTier;
  targetFileName?: string;
  status: 'queued' | 'downloading' | 'transcoding' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  progressPercent: number;
  message: string;
  folderUrl?: string;
  file?: DriveSavedFile;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'gn_tracked_drive_jobs_v1';
export const DRIVE_JOBS_EVENT = 'gn-drive-jobs-changed';
const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'transcoding', 'uploading']);

export const isJobActive = (job: Pick<TrackedDriveJob, 'status'>): boolean =>
  ACTIVE_STATUSES.has(job.status);

export const readTrackedDriveJobs = (): TrackedDriveJob[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return parsed
      .filter((j) => j && typeof j.jobId === 'string' && (j.createdAt || 0) >= cutoff)
      .slice(0, 20);
  } catch {
    return [];
  }
};

const writeTrackedDriveJobs = (jobs: TrackedDriveJob[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 20)));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(DRIVE_JOBS_EVENT));
};

export const upsertTrackedDriveJob = (job: TrackedDriveJob) => {
  const existing = readTrackedDriveJobs();
  const idx = existing.findIndex((j) => j.jobId === job.jobId);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...job, updatedAt: Date.now() };
  } else {
    existing.unshift({ ...job, updatedAt: Date.now() });
  }
  writeTrackedDriveJobs(existing);
};

export const patchTrackedDriveJob = (jobId: string, patch: Partial<TrackedDriveJob>) => {
  const existing = readTrackedDriveJobs();
  const idx = existing.findIndex((j) => j.jobId === jobId);
  if (idx < 0) return;
  existing[idx] = { ...existing[idx], ...patch, updatedAt: Date.now() };
  writeTrackedDriveJobs(existing);
};

export const dismissTrackedDriveJob = (jobId: string) => {
  const existing = readTrackedDriveJobs().filter((j) => j.jobId !== jobId);
  writeTrackedDriveJobs(existing);
};

export const clearFinishedTrackedDriveJobs = () => {
  const activeOnly = readTrackedDriveJobs().filter((j) => isJobActive(j));
  writeTrackedDriveJobs(activeOnly);
};

export const cancelTrackedDriveJob = async (jobId: string): Promise<void> => {
  const existing = readTrackedDriveJobs();
  const target = existing.find((j) => j.jobId === jobId);
  const token = getDriveAccessToken();

  patchTrackedDriveJob(jobId, {
    status: 'cancelled',
    message: 'Download cancelled by user.',
  });

  if (token || target?.jobKey) {
    await cancelGoogleDriveJob(token, jobId, target?.jobKey).catch(() => {});
  }
};

export const syncTrackedDriveJobsWithServer = async (): Promise<TrackedDriveJob[]> => {
  const current = readTrackedDriveJobs();
  const active = current.filter((j) => isJobActive(j));
  if (active.length === 0) return current;

  const token = getDriveAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch('/api/drive/jobs/batch-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jobs: active.map((j) => ({ jobId: j.jobId, jobKey: j.jobKey || '' })),
      }),
    });

    if (!res.ok) return current;
    const data = await res.json().catch(() => ({}));
    const updates: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    const missingIds: string[] = Array.isArray(data.missingIds) ? data.missingIds : [];

    if (updates.length === 0 && missingIds.length === 0) return current;

    let changed = false;
    const next = current.map((job) => {
      const serverJob = updates.find((u) => u.jobId === job.jobId);
      if (serverJob) {
        changed = true;
        return {
          ...job,
          status: serverJob.status || job.status,
          progressPercent:
            typeof serverJob.progressPercent === 'number'
              ? serverJob.progressPercent
              : job.progressPercent,
          message: serverJob.message || job.message,
          targetFileName: serverJob.targetFileName || job.targetFileName,
          folderUrl: serverJob.folderUrl || job.folderUrl || DEFAULT_DRIVE_URL,
          file: serverJob.file || job.file,
          updatedAt: Date.now(),
        } as TrackedDriveJob;
      }
      if (missingIds.includes(job.jobId) && isJobActive(job)) {
        changed = true;
        return {
          ...job,
          status: 'failed' as const,
          message: 'Download session expired on server. Please tap Download again.',
          updatedAt: Date.now(),
        };
      }
      return job;
    });

    if (changed) {
      writeTrackedDriveJobs(next);
    }
    return next;
  } catch {
    return current;
  }
};

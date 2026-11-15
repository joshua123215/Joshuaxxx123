import React, { useEffect, useState } from 'react';
import {
  Loader2,
  ExternalLink,
  Ban,
  CheckCircle2,
  AlertTriangle,
  X,
  HardDrive,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DEFAULT_DRIVE_URL } from '../utils/googleDrive';
import {
  DRIVE_JOBS_EVENT,
  TrackedDriveJob,
  cancelTrackedDriveJob,
  clearFinishedTrackedDriveJobs,
  dismissTrackedDriveJob,
  isJobActive,
  readTrackedDriveJobs,
  syncTrackedDriveJobsWithServer,
} from '../utils/driveJobStore';

export default function ActiveDownloadsBar() {
  const [jobs, setJobs] = useState<TrackedDriveJob[]>(() => readTrackedDriveJobs());
  const [cancellingIds, setCancellingIds] = useState<Record<string, boolean>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const refreshFromStorage = () => {
      setJobs(readTrackedDriveJobs());
    };

    window.addEventListener(DRIVE_JOBS_EVENT, refreshFromStorage);
    window.addEventListener('storage', refreshFromStorage);

    // Sync right away on page load/refresh
    syncTrackedDriveJobsWithServer().then(setJobs);

    return () => {
      window.removeEventListener(DRIVE_JOBS_EVENT, refreshFromStorage);
      window.removeEventListener('storage', refreshFromStorage);
    };
  }, []);

  const hasActive = jobs.some((j) => isJobActive(j));

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => {
      syncTrackedDriveJobsWithServer().then(setJobs);
    }, 1400);
    return () => clearInterval(timer);
  }, [hasActive]);

  if (jobs.length === 0) return null;

  const activeCount = jobs.filter((j) => isJobActive(j)).length;
  const finishedCount = jobs.length - activeCount;

  const handleCancel = async (jobId: string) => {
    setCancellingIds((prev) => ({ ...prev, [jobId]: true }));
    try {
      await cancelTrackedDriveJob(jobId);
      setJobs(readTrackedDriveJobs());
    } finally {
      setCancellingIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 mb-4">
      <div className="bg-[#121927] border border-blue-500/35 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-blue-950/50 border-b border-blue-500/20 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="flex items-center gap-2 text-left text-xs font-extrabold text-white"
          >
            {hasActive ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
            ) : (
              <HardDrive className="w-4 h-4 text-green-400 flex-shrink-0" />
            )}
            <span>
              Google Drive Downloads{' '}
              {activeCount > 0 ? `(${activeCount} active)` : `(${jobs.length} recent)`}
            </span>
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>

          <div className="flex items-center gap-2">
            {finishedCount > 0 && (
              <button
                type="button"
                onClick={() => clearFinishedTrackedDriveJobs()}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-semibold transition-colors"
              >
                Clear Finished
              </button>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-3 space-y-2.5">
            {jobs.map((job) => {
              const active = isJobActive(job);
              const isCompleted = job.status === 'completed';
              const isCancelled = job.status === 'cancelled';
              const driveHref =
                job.file?.webViewLink || job.folderUrl || DEFAULT_DRIVE_URL;

              return (
                <div
                  key={job.jobId}
                  className={`p-3 rounded-xl border space-y-2 ${
                    isCompleted
                      ? 'bg-green-950/25 border-green-500/30'
                      : isCancelled
                        ? 'bg-white/5 border-white/10'
                        : job.status === 'failed'
                          ? 'bg-red-950/30 border-red-500/30'
                          : 'bg-black/35 border-blue-500/25'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {active && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />}
                        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                        {job.status === 'failed' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        {isCancelled && <Ban className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        <span className="text-xs font-bold text-white truncate">
                          {job.title} ({job.quality === '420p' ? '420p ~400 MB' : '1080p ~1 GB'})
                        </span>
                        {active && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                            {job.progressPercent}%
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-1">{job.message}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={driveHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                          isCompleted
                            ? 'bg-green-600 hover:bg-green-500 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{isCompleted ? 'Open in Drive' : 'Open Drive App'}</span>
                      </a>

                      {active ? (
                        <button
                          type="button"
                          onClick={() => handleCancel(job.jobId)}
                          disabled={Boolean(cancellingIds[job.jobId])}
                          className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-60"
                        >
                          {cancellingIds[job.jobId] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Ban className="w-3 h-3" />
                          )}
                          <span>Cancel</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => dismissTrackedDriveJob(job.jobId)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {active && (
                    <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(3, job.progressPercent))}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

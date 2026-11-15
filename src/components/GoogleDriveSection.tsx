import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FolderOpen,
  LogOut,
  FileVideo,
  FileText,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { auth, DEFAULT_GOOGLE_DRIVE_EMAIL } from '../lib/firebase';
import {
  DEFAULT_DRIVE_URL,
  DriveSavedFile,
  connectGoogleDriveAccount,
  clearDriveAccessToken,
  deleteGoogleDriveMovie,
  formatBytes,
  getDriveAccessToken,
  initDriveAuth,
  listGoogleDriveFolderAndMovies,
} from '../utils/googleDrive';

interface GoogleDriveSectionProps {
  onTokenChange?: (token: string | null, email: string | null) => void;
  refreshTrigger?: number;
  compact?: boolean;
}

export function GoogleSignInButton({
  onClick,
  disabled,
  label = 'Sign in with Google',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gsi-material-button"
    >
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            style={{ display: 'block', width: '18px', height: '18px' }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">{label}</span>
      </div>
    </button>
  );
}

export interface DuplicateOverwriteModalProps {
  isOpen: boolean;
  fileName: string;
  existingFile?: DriveSavedFile | null;
  isSaving: boolean;
  onConfirmOverwrite: () => void;
  onCancel: () => void;
}

export function DriveOverwriteConfirmModal({
  isOpen,
  fileName,
  existingFile,
  isSaving,
  onConfirmOverwrite,
  onCancel,
}: DuplicateOverwriteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10050] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#151515] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">File Already Exists in Google Drive</h3>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              A file named <span className="text-white font-semibold break-all">"{fileName}"</span> is already inside your{' '}
              <span className="text-blue-300 font-semibold">GlobalNews Movies</span> folder
              {existingFile?.size ? ` (${formatBytes(existingFile.size)})` : ''}. Do you want to replace it?
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmOverwrite}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Replace Existing File</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GoogleDriveSection({
  onTokenChange,
  refreshTrigger = 0,
  compact = false,
}: GoogleDriveSectionProps) {
  const [driveToken, setDriveToken] = useState<string | null>(() => getDriveAccessToken());
  const [connectedEmail, setConnectedEmail] = useState<string | null>(() => auth.currentUser?.email || null);
  const [files, setFiles] = useState<DriveSavedFile[]>([]);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Explicit confirmation dialog state before deleting a file from Google Drive
  const [filePendingDelete, setFilePendingDelete] = useState<DriveSavedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFiles = useCallback(async (token: string) => {
    setIsLoadingFiles(true);
    setError(null);
    try {
      const listing = await listGoogleDriveFolderAndMovies(token);
      setFiles(listing.files);
      setFolderUrl(listing.folderUrl);
    } catch (err: any) {
      const msg = err?.message || 'Could not load Google Drive files.';
      setError(msg);
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('reconnect')) {
        setDriveToken(null);
        setFolderUrl(null);
        onTokenChange?.(null, auth.currentUser?.email || null);
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, [onTokenChange]);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user: User, token: string) => {
        setDriveToken(token);
        setConnectedEmail(user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
        onTokenChange?.(token, user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
      },
      (user: User | null) => {
        const memToken = getDriveAccessToken();
        setDriveToken(memToken);
        setConnectedEmail(user?.email || null);
        if (!memToken) {
          setFiles([]);
        }
        onTokenChange?.(memToken, user?.email || null);
      }
    );
    return () => unsubscribe();
  }, [onTokenChange]);

  useEffect(() => {
    const token = getDriveAccessToken();
    if (token) {
      setDriveToken(token);
      setConnectedEmail(auth.currentUser?.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
      loadFiles(token);
    }
  }, [refreshTrigger, loadFiles]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const { user, accessToken } = await connectGoogleDriveAccount(DEFAULT_GOOGLE_DRIVE_EMAIL);
      setDriveToken(accessToken);
      setConnectedEmail(user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
      onTokenChange?.(accessToken, user.email || DEFAULT_GOOGLE_DRIVE_EMAIL);
      setIsExpanded(true);
      await loadFiles(accessToken);
    } catch (err: any) {
      setError(err?.message || 'Google Drive sign-in was cancelled or blocked.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectDrive = () => {
    clearDriveAccessToken();
    setDriveToken(null);
    setFiles([]);
    onTokenChange?.(null, connectedEmail);
  };

  const handleConfirmDelete = async () => {
    if (!filePendingDelete || !driveToken) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteGoogleDriveMovie(driveToken, filePendingDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== filePendingDelete.id));
      setFilePendingDelete(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete file from Google Drive.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Google Drive Cloud Saver
              </h3>
              {driveToken ? (
                <span className="px-2.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-300 text-[11px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected ({connectedEmail || DEFAULT_GOOGLE_DRIVE_EMAIL})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 text-[11px] font-medium">
                  Account: {DEFAULT_GOOGLE_DRIVE_EMAIL}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Save compressed <strong className="text-gray-200">420p (~400 MB)</strong> or clear{' '}
              <strong className="text-gray-200">1080p (~1 GB)</strong> movies directly to your{' '}
              <span className="text-blue-300 font-medium">GlobalNews Movies</span> folder in Google Drive without wasting phone data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!driveToken ? (
            <GoogleSignInButton
              onClick={handleConnect}
              disabled={isConnecting}
              label={isConnecting ? 'Connecting Drive...' : 'Sign in with Google'}
            />
          ) : (
            <>
              <a
                href={folderUrl || DEFAULT_DRIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                title="Open your GlobalNews Movies folder in Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Drive App</span>
              </a>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>{isExpanded ? `Hide Saved (${files.length})` : `View Saved (${files.length})`}</span>
              </button>
              <button
                type="button"
                onClick={() => driveToken && loadFiles(driveToken)}
                disabled={isLoadingFiles}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                title="Refresh Google Drive folder"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-colors"
              >
                Switch Account
              </button>
              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-colors"
                title="Disconnect Google Drive session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {driveToken && isExpanded && (
        <div className="pt-3 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold text-gray-300">
              Folder: GlobalNews Movies
            </span>
            <span>{files.length} saved item{files.length === 1 ? '' : 's'}</span>
          </div>

          {isLoadingFiles ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Loading your Google Drive folder...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="py-4 px-3 rounded-xl bg-black/30 text-center text-xs text-gray-400">
              No movies saved in <strong className="text-gray-200">GlobalNews Movies</strong> yet. Pick any movie below and choose <strong className="text-green-300">Save to Google Drive</strong>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {files.map((file) => {
                const isVideo = file.mimeType?.startsWith('video/');
                return (
                  <div
                    key={file.id}
                    className="p-3 rounded-xl bg-[#1b1b1b] border border-white/5 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                        {isVideo ? <FileVideo className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-2">
                          <span>{formatBytes(file.size)}</span>
                          {file.createdTime && (
                            <span>• {new Date(file.createdTime).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 transition-colors"
                          title="Open in Google Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setFilePendingDelete(file)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 transition-colors"
                        title="Delete from Google Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Explicit React Confirmation Dialog before Deleting from Google Drive */}
      {filePendingDelete && (
        <div className="fixed inset-0 z-[10050] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#151515] border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete File from Google Drive?</h3>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Are you sure you want to permanently remove{' '}
                  <span className="text-white font-semibold break-all">"{filePendingDelete.name}"</span> from your Google Drive?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFilePendingDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

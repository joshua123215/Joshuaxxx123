import React, { useEffect, useState, useRef } from 'react';
import { Loader2, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';

interface CleanVideoPlayerProps {
  src: string;
  id?: string;
  onNextServer?: () => void;
  serverName?: string;
}

export default function CleanVideoPlayer({ 
  src, 
  id,
  onNextServer,
  serverName
}: CleanVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Global popup interception while player is mounted
  useEffect(() => {
    const originalOpen = window.open;
    window.open = function (url?: string | URL) {
      console.warn('Protected against unauthorized popup URL:', url);
      return null;
    };

    const handleBlur = () => {
      if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        setTimeout(() => {
          window.focus();
        }, 20);
      }
    };

    window.addEventListener('blur', handleBlur);

    return () => {
      window.open = originalOpen;
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Reset loading timer on src change
  useEffect(() => {
    setIsLoading(true);
    setLoadTimeout(false);

    const timer = setTimeout(() => {
      setLoadTimeout(true);
    }, 6000);

    return () => clearTimeout(timer);
  }, [src]);

  const handleReload = () => {
    if (iframeRef.current) {
      setIsLoading(true);
      setLoadTimeout(false);
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 100);
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/90 text-white space-y-3 pointer-events-none">
          <Loader2 className="w-9 h-9 text-blue-500 animate-spin" />
          <div className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
            <span>Connecting to {serverName || 'HD Stream'}...</span>
          </div>
        </div>
      )}

      {/* Main Video Iframe */}
      <iframe
        id={id}
        ref={iframeRef}
        src={src}
        className="w-full h-full border-0 relative z-0"
        allowFullScreen={true}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setIsLoading(false)}
      />

      {/* Fallback helper if loading takes a few seconds or server is slow */}
      {loadTimeout && (
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#141414]/95 backdrop-blur-md rounded-xl border border-white/10 shadow-xl text-xs">
          <div className="flex items-center gap-2 text-yellow-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11px] text-gray-200">Stream taking long or blank?</span>
          </div>
          <div className="flex items-center gap-2">
            {onNextServer && (
              <button
                onClick={onNextServer}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] transition-colors flex items-center gap-1 shadow"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try Next Server</span>
              </button>
            )}
            <button
              onClick={handleReload}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-gray-300 font-semibold rounded-lg text-[11px] transition-colors"
            >
              Reload
            </button>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-gray-300 font-semibold rounded-lg text-[11px] transition-colors flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>New Tab</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

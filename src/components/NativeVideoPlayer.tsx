import React, { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

interface NativeVideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
}

export default function NativeVideoPlayer({ src, poster, autoPlay = true }: NativeVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      playerRef.current = new Plyr(videoRef.current, {
        controls: [
          'play-large', 
          'play', 
          'progress', 
          'current-time', 
          'mute', 
          'volume', 
          'settings', 
          'pip', 
          'airplay', 
          'fullscreen'
        ],
        autoplay: autoPlay,
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [autoPlay]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.source = {
        type: 'video',
        sources: [
          {
            src: src,
            type: 'video/mp4',
          },
        ],
        poster: poster,
      };
      
      if (autoPlay) {
         // Auto-play the new source when it changes if autoPlay is true
         const playPromise = playerRef.current.play();
         if (playPromise !== undefined) {
             playPromise.catch((err) => console.log("Autoplay prevented:", err));
         }
      }
    }
  }, [src, poster, autoPlay]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center plyr-wrapper">
      <video
        ref={videoRef}
        className="w-full h-full max-h-[80vh] rounded-lg shadow-2xl"
        playsInline
      />
    </div>
  );
}

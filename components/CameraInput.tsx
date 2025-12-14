import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Image as ImageIcon, RefreshCcw, Zap, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { Logger } from '../utils/logger';

interface CameraInputProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

export const CameraInput: React.FC<CameraInputProps> = ({ onImageSelected, isLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use a ref for the stream to ensure cleanup always works regardless of render closures
  const streamRef = useRef<MediaStream | null>(null);
  // Track mount state to prevent async state updates after unmount
  const isMountedRef = useRef(true);

  const [permissionError, setPermissionError] = useState(false);
  const [permissionErrorMsg, setPermissionErrorMsg] = useState<string>("");
  const [cameraActive, setCameraActive] = useState(false);

  // Zoom State
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 5, step: 0.1 });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch(e) {}
      });
      streamRef.current = null;
    }
    if (isMountedRef.current) {
      setCameraActive(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    stopCamera();

    if (!isMountedRef.current) return;

    try {
      setPermissionError(false);
      setPermissionErrorMsg("");
      
      let mediaStream: MediaStream | null = null;
      let lastError: any = null;
      
      // Strategy 1: Ideal Mobile OCR (Environment facing, 720p)
      // Note: Removed 'zoom: true' from constraints as it causes OverconstrainedError on many devices
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
      } catch (err) {
        console.log("Primary camera constraint failed:", err);
        lastError = err;
      }

      // Strategy 2: Relaxed constraints (Any facing mode, 720p) - Good for laptops
      if (!mediaStream) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { 
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
        } catch (err) {
          console.log("Secondary camera constraint failed:", err);
          lastError = err;
        }
      }

      // Strategy 3: Desperation (Just give me any video) - Good for low-end hardware
      if (!mediaStream) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (err) {
          console.error("All camera strategies failed:", err);
          lastError = err;
        }
      }

      // Check if unmounted during await or if all strategies failed
      if (!isMountedRef.current) {
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        return;
      }

      if (!mediaStream) {
        throw lastError || new Error("Could not acquire video stream");
      }

      streamRef.current = mediaStream;
      
      // Detect Zoom Capabilities (Only after stream is acquired)
      const track = mediaStream.getVideoTracks()[0];
      const trackAny = track as any;
      
      if (track && typeof trackAny.getCapabilities === 'function') {
        try {
          const capabilities = trackAny.getCapabilities();
          if (capabilities.zoom) {
            if (isMountedRef.current) {
              setZoomSupported(true);
              setZoomRange({
                min: capabilities.zoom.min || 1,
                max: capabilities.zoom.max || 5,
                step: capabilities.zoom.step || 0.1
              });
              
              const settings = track.getSettings() as any;
              if (settings.zoom) {
                 setZoomLevel(settings.zoom);
              }
            }
          }
        } catch (e) {
           Logger.warn("Zoom capabilities detection failed", { error: e });
        }
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Wait for the first frame to actually load before showing the video element.
        videoRef.current.onloadedmetadata = () => {
           // iOS Fix: Explicitly call play() to ensure video starts
           videoRef.current?.play().catch(e => Logger.error("Video play failed", e));
        };
        videoRef.current.onloadeddata = () => {
           if (isMountedRef.current) setCameraActive(true);
        };
      }
    } catch (err: any) {
      Logger.error("Camera access denied or unavailable", err);
      if (isMountedRef.current) {
        setPermissionError(true);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           setPermissionErrorMsg("Permission denied. Please allow camera access in your browser settings.");
        } else if (err.name === 'NotFoundError') {
           setPermissionErrorMsg("No camera device found.");
        } else {
           setPermissionErrorMsg("Camera unavailable.");
        }
        setCameraActive(false);
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    
    // Handle visibility change (tab switch / app minimize) to save battery and release camera
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
      } else {
        startCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopCamera();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startCamera, stopCamera]);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    setZoomLevel(newZoom);
    
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        // @ts-ignore - applyConstraints is standard
        track.applyConstraints({
          advanced: [{ zoom: newZoom }]
        }).catch((err: any) => Logger.warn("Zoom apply failed", { error: err }));
      }
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video stream
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Optimization: scale down to max 1024px width
    const MAX_WIDTH = 1024;
    let finalWidth = width;
    let finalHeight = height;

    if (width > MAX_WIDTH) {
        const scaleFactor = MAX_WIDTH / width;
        finalWidth = MAX_WIDTH;
        finalHeight = height * scaleFactor;
    }

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, finalWidth, finalHeight);
      
      // Optimization: Compress to JPEG 0.7 quality (better bandwidth)
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      onImageSelected(base64);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Release memory

      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Apply the same resizing logic
      const MAX_WIDTH = 1024;
      let finalWidth = img.width;
      let finalHeight = img.height;

      if (finalWidth > MAX_WIDTH) {
          const scaleFactor = MAX_WIDTH / finalWidth;
          finalWidth = MAX_WIDTH;
          finalHeight = finalHeight * scaleFactor;
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;

      ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
      
      // Optimization: Compress to JPEG 0.7 quality
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      onImageSelected(base64);
    };

    img.src = objectUrl;
    e.target.value = '';
  };

  const triggerGallery = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      
      {/* Camera Viewfinder */}
      <div className="relative w-full aspect-[4/5] sm:aspect-[4/3] bg-black rounded-3xl overflow-hidden shadow-xl border border-gray-800 group">
        
        {/* Live Camera View */}
        {!permissionError && (
            <video 
              ref={videoRef}
              playsInline 
              muted 
              className={`w-full h-full object-cover transition-opacity duration-150 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            />
        )}

        {/* Fallback / Loading State */}
        {(!cameraActive || permissionError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
               {permissionError ? (
                   <>
                     <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <AlertCircle size={24} className="text-red-500" />
                     </div>
                     <p className="text-sm font-medium text-white mb-1">Camera Access Blocked</p>
                     <p className="text-xs text-gray-400 max-w-[200px] mb-4 leading-relaxed">
                       {permissionErrorMsg || "Please enable camera permissions in your browser settings."}
                     </p>
                     <button 
                       onClick={triggerGallery}
                       className="px-4 py-2 bg-white/10 rounded-full text-xs font-semibold hover:bg-white/20 transition-colors"
                     >
                       Upload from Gallery instead
                     </button>
                   </>
               ) : (
                   <div className="animate-pulse flex flex-col items-center">
                     <div className="w-10 h-10 rounded-full border-2 border-gray-600 border-t-kerala-green animate-spin mb-4"></div>
                     <p className="text-sm font-medium">Opening Camera...</p>
                   </div>
               )}
            </div>
        )}
        
        {/* Zoom Control Overlay - Only show if supported and camera is active */}
        {cameraActive && zoomSupported && !isLoading && (
          <div className="absolute bottom-28 left-0 right-0 px-8 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 z-20">
             <div className="bg-black/40 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-3 w-full max-w-[240px] border border-white/10 shadow-lg">
                <ZoomOut size={16} className="text-white/80" />
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoomLevel}
                  onChange={handleZoomChange}
                  className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                />
                <ZoomIn size={16} className="text-white/80" />
             </div>
             <div className="bg-kerala-green text-white text-[10px] font-bold px-2 py-1 rounded-md min-w-[36px] text-center shadow-md">
                {zoomLevel.toFixed(1)}x
             </div>
          </div>
        )}

        {/* Capture Overlay UI */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between z-10">
            
            {/* Gallery Button */}
            <button 
              onClick={triggerGallery}
              disabled={isLoading}
              className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all active:scale-95"
            >
              <ImageIcon size={24} />
            </button>

            {/* Shutter Button */}
            <button 
               onClick={captureFrame}
               disabled={isLoading || !cameraActive}
               className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90 shadow-lg ${isLoading ? 'opacity-50' : 'hover:scale-105'}`}
            >
               <div className="w-16 h-16 bg-white rounded-full"></div>
            </button>

            {/* Restart Camera (if needed) */}
            <button 
              onClick={() => {
                  stopCamera();
                  setTimeout(startCamera, 100);
              }}
              className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all active:scale-95"
            >
              <RefreshCcw size={24} />
            </button>
        </div>

        {/* Scanning Line Animation */}
        {cameraActive && !isLoading && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-kerala-green/80 shadow-[0_0_20px_rgba(0,106,78,0.8)] animate-[scan_2s_linear_infinite] opacity-50 pointer-events-none"></div>
        )}
      </div>

      {/* Hidden Inputs/Canvas */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
         <Zap size={12} className="text-kerala-gold fill-current" />
         <span>Instant Capture Active</span>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};
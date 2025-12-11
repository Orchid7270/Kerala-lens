import React, { useRef, useState, useEffect } from 'react';
import { Camera, Image as ImageIcon, RefreshCcw, Zap } from 'lucide-react';

interface CameraInputProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

export const CameraInput: React.FC<CameraInputProps> = ({ onImageSelected, isLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    // Attempt to start camera immediately on mount
    startCamera();
    
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setCameraActive(false);
    }
  };

  const startCamera = async () => {
    try {
      setPermissionError(false);
      
      // Optimization: Requesting 1280x720 (720p) is significantly faster to initialize 
      // on Android devices than letting the browser negotiate the maximum possible resolution (e.g. 4K).
      // It also consumes less battery and processes faster while remaining sufficient for OCR.
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Wait for the first frame to actually load before showing the video element.
        // This prevents a black flash and ensures "instant" appearance once ready.
        videoRef.current.onloadeddata = () => {
           setCameraActive(true);
        };
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable", err);
      setPermissionError(true);
      setCameraActive(false);
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video stream
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Optimization: processing 4k images is slow. 
    // Scale down to max 1024px width while maintaining aspect ratio.
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
      
      // Compress to JPEG 0.8 quality
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      onImageSelected(base64);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onImageSelected(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const triggerGallery = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      
      {/* Removed 'animate-in' from parent to make UI appear instantly */}
      <div className="relative w-full aspect-[4/5] sm:aspect-[4/3] bg-black rounded-3xl overflow-hidden shadow-xl border border-gray-800">
        
        {/* Live Camera View */}
        {!permissionError && (
            <video 
              ref={videoRef}
              autoPlay 
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
                     <Camera size={48} className="mb-4 opacity-50" />
                     <p className="text-sm">Camera access unavailable.</p>
                     <p className="text-xs mt-1">Please use the gallery upload below.</p>
                   </>
               ) : (
                   <div className="animate-pulse flex flex-col items-center">
                     {/* Simplified loader for faster visual feedback */}
                     <div className="w-10 h-10 rounded-full border-2 border-gray-600 border-t-kerala-green animate-spin mb-4"></div>
                     <p className="text-sm font-medium">Opening Camera...</p>
                   </div>
               )}
            </div>
        )}

        {/* Capture Overlay UI */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
            
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
               className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90 ${isLoading ? 'opacity-50' : 'hover:scale-105'}`}
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

        {/* Scanning Line Animation (Visual Flair) */}
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
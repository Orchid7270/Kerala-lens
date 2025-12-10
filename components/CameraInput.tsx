import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, Upload } from 'lucide-react';

interface CameraInputProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

export const CameraInput: React.FC<CameraInputProps> = ({ onImageSelected, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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
    // Reset value to allow re-selecting the same file if needed
    e.target.value = '';
  };

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const triggerGallery = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Camera Input (Forces Camera on Mobile) 
          Using specific mime types can sometimes be faster than image/* on Android
      */}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment" 
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={isLoading}
      />

      {/* Gallery Input (Standard Picker) */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={galleryInputRef}
        onChange={handleFileChange}
        disabled={isLoading}
      />

      <button
        onClick={triggerCamera}
        disabled={isLoading}
        className="group relative w-full aspect-[4/3] bg-gray-100 rounded-3xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-4 hover:bg-gray-50 hover:border-kerala-green transition-all active:scale-[0.98] overflow-hidden shadow-inner"
      >
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>
        
        <div className="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center text-kerala-green group-hover:text-kerala-gold transition-colors">
          <Camera size={40} strokeWidth={1.5} />
        </div>
        <div className="text-center z-10">
          <p className="font-semibold text-gray-700 text-lg">Tap to Capture</p>
          <p className="text-sm text-gray-500">Take a photo of a sign or menu</p>
        </div>
      </button>

      <div className="flex flex-col gap-3">
         <div className="flex items-center gap-2 px-2">
            <div className="h-px bg-gray-200 flex-1"></div>
            <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Or</span>
            <div className="h-px bg-gray-200 flex-1"></div>
         </div>
         
         <button
            onClick={triggerGallery}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-700 font-medium hover:bg-gray-50 active:scale-95 transition-all w-full"
         >
            <ImageIcon size={20} className="text-kerala-green" />
            <span>Upload from Gallery</span>
         </button>
      </div>
    </div>
  );
};
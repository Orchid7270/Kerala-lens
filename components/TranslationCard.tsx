import React, { useState, useEffect, useRef } from 'react';
import { TranslationResult } from '../types';
import { Volume2, Check, Copy, Loader2, Play, Square, AlertCircle, Info } from 'lucide-react';
import { generateSpeech } from '../services/gemini';

interface TranslationCardProps {
  result: TranslationResult;
}

export const TranslationCard: React.FC<TranslationCardProps> = ({ result }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [pcmData, setPcmData] = useState<ArrayBuffer | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Refs for Web Audio API and Promise management
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPromiseRef = useRef<Promise<ArrayBuffer> | null>(null);

  // Clean up audio context when component unmounts or result changes
  useEffect(() => {
    // Reset state for new translation
    setPcmData(null);
    stopPlayback();
    setError(null);
    audioPromiseRef.current = null;

    // Define the fetch operation
    const fetchAudio = async () => {
      // Don't prefetch if text is empty or very long (quota/latency optimization)
      if (!result.translatedText || result.translatedText.length > 500) {
         return Promise.reject("Text too long for auto-prefetch");
      }
      return generateSpeech(result.translatedText, 'Kore');
    };

    // Start prefetch immediately
    const promise = fetchAudio();
    audioPromiseRef.current = promise;

    let isMounted = true;
    promise
      .then((data) => {
        if (isMounted) {
          setPcmData(data);
        }
      })
      .catch((e) => {
        // We silently ignore prefetch errors; the user will see the error when they click "Pronounce"
        console.warn("Audio prefetch background error (silent):", e);
      });
    
    return () => {
      isMounted = false;
      stopPlayback();
    };
  }, [result.translatedText]);

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
       audioContextRef.current.close().catch(console.error);
       audioContextRef.current = null;
    }
    
    setIsPlaying(false);
  };

  const playAudioData = async (data: ArrayBuffer) => {
    try {
      stopPlayback(); // Ensure any existing audio is stopped

      // Initialize AudioContext with the specific sample rate for Gemini TTS (24kHz)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      audioContextRef.current = ctx;

      // Gemini returns raw PCM 16-bit integers. Convert to Float32 [-1.0, 1.0]
      const int16Data = new Int16Array(data);
      const float32Data = new Float32Array(int16Data.length);
      
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      // Create buffer: 1 channel (mono), correct length, 24kHz
      const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      // Create source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };

      sourceNodeRef.current = source;
      source.start(0);
      setIsPlaying(true);

    } catch (err) {
      console.error("Audio playback error:", err);
      setError("Audio playback failed.");
      setIsPlaying(false);
    }
  };

  const handlePlayAudio = async () => {
    setError(null);

    // Toggle: if playing, stop it.
    if (isPlaying) {
      stopPlayback();
      return;
    }

    // 1. If we already have the data locally, play it immediately.
    if (pcmData) {
      await playAudioData(pcmData);
      return;
    }

    setIsGeneratingAudio(true);
    try {
      let data: ArrayBuffer;

      // 2. If a prefetch request is already in flight, wait for it instead of starting a new one.
      if (audioPromiseRef.current) {
        try {
          data = await audioPromiseRef.current;
        } catch (prefetchError) {
          // If the background prefetch failed, retry explicitly now
          console.log("Prefetch failed previously, retrying...");
          audioPromiseRef.current = null;
          data = await generateSpeech(result.translatedText, 'Kore');
        }
      } else {
        // 3. No prefetch active, start a new request
        data = await generateSpeech(result.translatedText, 'Kore');
      }

      // Cache and play
      setPcmData(data);
      await playAudioData(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load audio");
      // Clear promise so user can try again next click
      audioPromiseRef.current = null;
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getConfidenceConfig = (score: number = 100) => {
    if (score >= 80) return { color: 'bg-green-100 text-green-700 border-green-200', label: 'High Confidence' };
    if (score >= 50) return { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Medium Confidence' };
    return { color: 'bg-red-100 text-red-700 border-red-200', label: 'Low Confidence' };
  };

  const confidence = getConfidenceConfig(result.confidenceScore);
  const isLowConfidence = (result.confidenceScore || 100) < 60;

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col gap-0">
      
      {/* Target Language Section (Featured) */}
      <div className="bg-kerala-green p-6 text-white relative overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-10">
           <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
         </div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider opacity-80 block">
               Translated to {result.targetLanguage}
            </span>
          </div>
          <h2 className="text-3xl font-bold font-malayalam leading-relaxed">
            {result.translatedText}
          </h2>
        </div>
      </div>

      {/* Source Text Section */}
      <div className="p-6 bg-white flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detected ({result.sourceLanguage})</span>
            {result.confidenceScore !== undefined && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${confidence.color}`}>
                {confidence.label} ({result.confidenceScore}%)
              </span>
            )}
        </div>
        
        {isLowConfidence && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 leading-relaxed">
              <strong>Caution:</strong> The text was difficult to read. The translation might be inaccurate. Please try capturing a clearer image.
            </p>
          </div>
        )}

        <p className="text-gray-600 text-lg mb-6 leading-relaxed">
          {result.detectedText}
        </p>

        <div className="mt-auto flex gap-3">
          <button
            onClick={handlePlayAudio}
            disabled={isGeneratingAudio}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all ${
              isPlaying 
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' 
                : 'bg-kerala-dark text-white hover:bg-black'
            } disabled:opacity-70`}
          >
            {isGeneratingAudio ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Square size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
            <span>{isPlaying ? 'Stop' : 'Pronounce'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all active:scale-95"
            title="Copy translation"
          >
             {isCopied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
             <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        {error && (
             <p className="mt-2 text-red-500 text-xs flex items-center gap-1">
               <AlertCircle size={12} /> {error}
             </p>
        )}
      </div>
    </div>
  );
};
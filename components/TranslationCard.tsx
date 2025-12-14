import React, { useState, useEffect, useRef } from 'react';
import { TranslationResult, EssentialPhrase } from '../types';
import { Volume2, Check, Copy, Loader2, Play, Square, AlertCircle, MapPin, Compass, ExternalLink, Lightbulb, MessageCircle, RefreshCw, Star, Navigation } from 'lucide-react';
import { generateSpeech, getMoreEssentialPhrases } from '../services/gemini';

interface TranslationCardProps {
  result: TranslationResult;
}

// Singleton AudioContext to prevent "max number of hardware contexts reached" errors
// Browsers typically limit to 6 contexts.
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
};

// Helper to decode raw PCM 16-bit 24kHz audio from Gemini
const decodePcmAudio = (buffer: ArrayBuffer, ctx: AudioContext): AudioBuffer => {
  let pcmData = buffer;
  
  // Safety: Int16Array requires even byte length. 
  // If API returns odd bytes (rare but possible with base64 decoding artifacts), trim the last byte.
  if (buffer.byteLength % 2 !== 0) {
     pcmData = buffer.slice(0, buffer.byteLength - 1);
  }

  const int16Data = new Int16Array(pcmData);
  const sampleRate = 24000; // Gemini TTS standard output
  const floatBuffer = ctx.createBuffer(1, int16Data.length, sampleRate);
  const channelData = floatBuffer.getChannelData(0);
  
  for (let i = 0; i < int16Data.length; i++) {
    // Convert PCM 16-bit integer to Float32 [-1.0, 1.0]
    channelData[i] = int16Data[i] / 32768.0;
  }
  
  return floatBuffer;
};

// Sub-component for individual Phrase Chips to manage audio state independently
const PhraseChip: React.FC<{ phrase: EssentialPhrase }> = ({ phrase }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      // Clean up running audio on unmount
      if (sourceRef.current) {
         try { sourceRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  const playPhrase = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling
    
    if (isPlaying) {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            setIsPlaying(false);
        }
        return;
    }

    setIsLoading(true);

    try {
      // 1. Fetch audio
      const audioBuffer = await generateSpeech(phrase.text, 'Kore');
      
      // 2. Get Shared Context
      const ctx = getAudioContext();
      
      // 3. Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
          await ctx.resume();
      }

      // 4. Decode
      const audioSourceBuffer = decodePcmAudio(audioBuffer, ctx);
      
      // 5. Play
      const source = ctx.createBufferSource();
      source.buffer = audioSourceBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      
      sourceRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (e) {
      console.error("Phrase playback failed", e);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={playPhrase}
      disabled={isLoading}
      className={`text-left p-4 rounded-xl border transition-all active:scale-[0.98] flex flex-col gap-2 w-full animate-in fade-in zoom-in-95 duration-300 shadow-sm ${
        isPlaying 
          ? 'bg-kerala-green/10 border-kerala-green ring-1 ring-kerala-green' 
          : 'bg-white border-gray-200 hover:border-kerala-green/50 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between w-full gap-3">
         {/* English Label - Large and clear */}
         <span className="text-sm font-bold text-gray-900 leading-tight">{phrase.label}</span>
         
         {/* Audio Icon Button */}
         <div className={`p-2 rounded-full shrink-0 transition-colors ${isPlaying ? 'bg-kerala-green text-white' : 'bg-gray-50 text-gray-400 group-hover:text-kerala-green'}`}>
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : isPlaying ? <Square size={16} fill="currentColor" /> : <Volume2 size={16} />}
         </div>
      </div>
      
      <div className="flex flex-col gap-1 mt-1">
         {/* Translated Text */}
         <span className="text-lg font-bold text-kerala-green font-malayalam leading-snug">{phrase.text}</span>
         {/* Pronunciation */}
         <span className="text-xs text-gray-500 font-medium">{phrase.pronunciation}</span>
      </div>
    </button>
  );
};

// Helper to inject currency symbols for natural TTS reading
const optimizeTextForSpeech = (text: string, sourceLanguage: string): string => {
  const lang = sourceLanguage.toLowerCase();
  let currency = '';

  if (['malayalam', 'hindi', 'tamil', 'kannada', 'telugu', 'bengali', 'marathi', 'english'].some(l => lang.includes(l))) {
    currency = '₹';
  } else if (['french', 'german', 'spanish', 'italian', 'dutch', 'portuguese'].some(l => lang.includes(l))) {
    currency = '€';
  } else if (['dollar', 'us'].some(l => lang.includes(l))) {
    currency = '$';
  }

  if (!currency) return text;
  const replaceStr = currency === '$' ? '$$$1' : `${currency}$1`;

  return text.split('\n').map(line => {
    if (/\b\d+\.\d{2}\b/.test(line)) {
      return line.replace(/(\d+\.\d{2})/, replaceStr);
    }
    if (/[.\-_]{2,}\s*(\d+)$/.test(line)) {
      return line.replace(/(\d+)$/, replaceStr);
    }
    return line;
  }).join('\n');
};

export const TranslationCard: React.FC<TranslationCardProps> = ({ result }) => {
  // TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [pcmData, setPcmData] = useState<ArrayBuffer | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Phrases State
  const [phrases, setPhrases] = useState<EssentialPhrase[]>(result.essentialPhrases || []);
  const [isRefreshingPhrases, setIsRefreshingPhrases] = useState(false);

  // Refs for managing playback and promises
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPromiseRef = useRef<Promise<ArrayBuffer> | null>(null);

  useEffect(() => {
    return () => {
      // Stop translation audio on unmount
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  // Sync phrases when result changes
  useEffect(() => {
    setPhrases(result.essentialPhrases || []);
  }, [result.essentialPhrases]);

  // Prefetch Audio when result changes
  useEffect(() => {
    setPcmData(null);
    stopPlayback();
    setError(null);
    audioPromiseRef.current = null;

    const fetchAudio = async () => {
      if (!result.translatedText || result.translatedText.length > 500) {
         return Promise.reject("Text too long for auto-prefetch");
      }
      const speechText = optimizeTextForSpeech(result.translatedText, result.sourceLanguage);
      try {
        return await generateSpeech(speechText, 'Kore');
      } catch (err) {
        return await generateSpeech(result.translatedText, 'Kore');
      }
    };

    const promise = fetchAudio();
    audioPromiseRef.current = promise;

    let isMounted = true;
    promise.then((data) => {
        if (isMounted) setPcmData(data);
      }).catch((e) => {
        console.warn("Audio prefetch background error (silent):", e);
      });
    
    return () => {
      isMounted = false;
      stopPlayback();
    };
  }, [result.translatedText, result.sourceLanguage]);

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const playAudioData = async (data: ArrayBuffer) => {
    try {
      stopPlayback(); 
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = decodePcmAudio(data, ctx);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
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
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (pcmData) {
      await playAudioData(pcmData);
      return;
    }
    setIsGeneratingAudio(true);
    try {
      let data: ArrayBuffer;
      if (audioPromiseRef.current) {
        try {
          data = await audioPromiseRef.current;
        } catch (prefetchError) {
          audioPromiseRef.current = null;
          const speechText = optimizeTextForSpeech(result.translatedText, result.sourceLanguage);
          data = await generateSpeech(speechText, 'Kore');
        }
      } else {
        const speechText = optimizeTextForSpeech(result.translatedText, result.sourceLanguage);
        data = await generateSpeech(speechText, 'Kore');
      }
      setPcmData(data);
      await playAudioData(data);
    } catch (err) {
      setError("Failed to load audio");
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

  const handleRefreshPhrases = async () => {
    if (isRefreshingPhrases || phrases.length === 0) return;
    setIsRefreshingPhrases(true);
    try {
      const newPhrases = await getMoreEssentialPhrases(phrases, result.detectedText);
      if (newPhrases && newPhrases.length > 0) {
        setPhrases(newPhrases);
      }
    } catch (e) {
      console.error("Failed to refresh phrases", e);
    } finally {
      setIsRefreshingPhrases(false);
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
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col gap-0 transition-all duration-500">
      
      {/* Target Language Section */}
      <div className="p-6 relative overflow-hidden transition-colors duration-500 bg-kerala-green text-white">
         <div className="absolute top-0 right-0 p-4 opacity-10">
           <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
         </div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider opacity-80 block">
               Translated to {result.targetLanguage}
            </span>
          </div>
          <h2 className="text-3xl font-bold font-malayalam leading-relaxed whitespace-pre-line">
            {result.translatedText}
          </h2>
        </div>
      </div>

      <div className="p-6 bg-white flex-1 flex flex-col">
        {/* Source Text Info */}
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
              <strong>Caution:</strong> The text was difficult to read. The translation might be inaccurate.
            </p>
          </div>
        )}

        <p className="text-gray-600 text-lg mb-6 leading-relaxed whitespace-pre-line">
          {result.detectedText}
        </p>

        {/* Travel Tip */}
        {result.travelTip && (
           <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 shadow-sm">
              <div className="p-2 bg-white rounded-full shadow-sm shrink-0">
                 <Lightbulb size={18} className="text-amber-500 fill-current" />
              </div>
              <div>
                 <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Local Insight</h4>
                 <p className="text-sm text-gray-800 font-medium leading-relaxed italic">
                   "{result.travelTip}"
                 </p>
              </div>
           </div>
        )}

        {/* Essential Phrases */}
        {phrases && phrases.length > 0 && (
           <div className="mb-8 pt-2 animate-in slide-in-from-bottom-2 duration-700">
             <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-2">
                 <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                   <MessageCircle size={16} />
                 </div>
                 <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Quick Phrases</h3>
               </div>
               <button 
                 onClick={handleRefreshPhrases}
                 disabled={isRefreshingPhrases}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-kerala-green rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                 title="Suggest different phrases"
               >
                 <RefreshCw size={12} className={isRefreshingPhrases ? "animate-spin" : ""} />
                 <span>Suggest More</span>
               </button>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               {phrases.map((phrase, idx) => (
                 <PhraseChip key={`${phrase.label}-${idx}`} phrase={phrase} />
               ))}
             </div>
           </div>
        )}

        {/* Tourist Recommendations - LESS CONGESTED DESIGN */}
        {result.recommendations && result.recommendations.length > 0 && (
           <div className="mt-2 mb-6 pt-6 border-t border-gray-100">
             <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-kerala-gold/10 rounded-lg">
                    <Compass size={18} className="text-kerala-gold" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Explore Nearby</h3>
               </div>
               <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                 {result.recommendations.length} Suggestions
               </span>
             </div>
             
             {/* IMPROVED SCROLLABLE CONTAINER: Wider, taller, more padding, better gap */}
             <div className="flex flex-col gap-4 max-h-[420px] overflow-y-auto pr-2 pb-2 scrollbar-thin">
               {result.recommendations.map((place, idx) => (
                 <a 
                   key={idx} 
                   href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="group block bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-lg hover:border-kerala-green/30 transition-all duration-300 active:scale-[0.99]"
                 >
                   <div className="flex items-start gap-4">
                     {/* Location Icon with Background */}
                     <div className="mt-1 w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-kerala-green group-hover:text-white transition-colors duration-300">
                        <MapPin size={18} />
                     </div>
                     
                     <div className="flex-1 min-w-0">
                       <div className="flex items-start justify-between gap-2">
                          <h4 className="text-base font-bold text-gray-900 leading-tight group-hover:text-kerala-green transition-colors">{place.name}</h4>
                          <Navigation size={14} className="text-gray-300 mt-1 group-hover:text-kerala-green transition-colors" />
                       </div>
                       
                       <p className="text-sm text-gray-500 mt-2 leading-relaxed group-hover:text-gray-600 transition-colors">
                         {place.description}
                       </p>
                       
                       <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md group-hover:bg-blue-100 transition-colors">
                             View on Maps
                          </span>
                       </div>
                     </div>
                   </div>
                 </a>
               ))}
             </div>
           </div>
        )}

        <div className="mt-auto flex gap-3 pt-2">
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
            <span>{isPlaying ? 'Stop' : 'Pronounce Translation'}</span>
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
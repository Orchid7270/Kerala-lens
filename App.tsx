import React, { useState, useEffect } from 'react';
import { CameraInput } from './components/CameraInput';
import { TranslationCard } from './components/TranslationCard';
import { LanguageSelector } from './components/LanguageSelector';
import { HistoryList } from './components/HistoryList';
import { translateImage, translateText } from './services/gemini';
import { TranslationResult, LanguageOption, AppState, HistoryItem } from './types';
import { RefreshCw, AlertTriangle, Sparkles, BrainCircuit, History, Scan } from 'lucide-react';

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', nativeName: 'कन्नड़' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption>(LANGUAGES[1]); 
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<'reading' | 'translating'>('reading');
  
  // App Launch State
  const [showSplash, setShowSplash] = useState(true);

  // Initialize with empty array to ensure fast First Contentful Paint (FCP)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Splash Screen Logic
  useEffect(() => {
    // Keep splash screen for at least 1.8s to allow camera to warm up behind scenes
    // and provide a polished "app loading" feel.
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  // Load history asynchronously after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kerala_lens_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  // Save history to local storage whenever it changes (skip if not loaded yet)
  useEffect(() => {
    if (!historyLoaded) return;
    try {
      // We don't save the image data to localStorage to avoid QuotaExceededError
      const historyToSave = history.map(({ imageUrl, ...rest }) => rest);
      localStorage.setItem('kerala_lens_history', JSON.stringify(historyToSave));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  }, [history, historyLoaded]);

  const addToHistory = (translation: TranslationResult) => {
    const newItem: HistoryItem = {
      ...translation,
      id: Date.now().toString(),
      timestamp: Date.now(),
      imageUrl: undefined 
    };
    setHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50 items
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('kerala_lens_history');
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setResult(item);
    setSelectedImage(null);
    setAppState(AppState.SUCCESS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageSelected = async (base64: string, targetLanguageOverride?: string) => {
    setSelectedImage(base64);
    setAppState(AppState.PROCESSING);
    setProcessingStage('reading');
    setErrorMsg(null);

    const targetLang = targetLanguageOverride || selectedLanguage.name;

    try {
      const translation = await translateImage(base64, targetLang);
      setResult(translation);
      addToHistory(translation);
      setAppState(AppState.SUCCESS);
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleReTranslation = async (langName: string) => {
    if (!result) return;
    
    setAppState(AppState.PROCESSING);
    setProcessingStage('translating'); 
    setErrorMsg(null);

    try {
      const newTranslation = await translateText(
        result.detectedText,
        result.sourceLanguage,
        langName,
        result.confidenceScore || 0
      );
      setResult(newTranslation);
      addToHistory(newTranslation);
      setAppState(AppState.SUCCESS);
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleError = (error: any) => {
    console.error(error);
    setAppState(AppState.ERROR);
    
    const errorMessage = error.toString();
    if (errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED")) {
      setErrorMsg("Access Denied (403). Please ensure the API Key is valid.");
    } else if (errorMessage.includes("429")) {
      setErrorMsg("Too many requests. Please wait a moment and try again.");
    } else if (errorMessage.includes("400")) {
      setErrorMsg("Bad Request. The image format might not be supported.");
    } else {
      setErrorMsg("Unable to process. Please check your internet connection.");
    }
  };

  const resetApp = () => {
    setSelectedImage(null);
    setResult(null);
    setAppState(AppState.IDLE);
    setErrorMsg(null);
  };

  const toggleHistory = () => {
    if (appState !== AppState.IDLE) {
      resetApp();
      setTimeout(() => {
        const historySection = document.getElementById('history-section');
        historySection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      const historySection = document.getElementById('history-section');
      if (historySection) {
        historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <>
      {/* SPLASH SCREEN */}
      {/* 
        This overlay provides immediate visual feedback on load, removing the perception of "slowness" 
        while allowing the heavy CameraInput component to initialize in the background.
      */}
      <div 
        className={`fixed inset-0 z-50 bg-kerala-green flex flex-col items-center justify-center transition-all duration-700 ease-out ${
          showSplash ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        <div className="relative">
           <div className="absolute inset-0 bg-white/20 rounded-full animate-ping blur-xl"></div>
           <div className="w-24 h-24 bg-white rounded-2xl shadow-2xl flex items-center justify-center relative z-10 animate-in zoom-in duration-500">
             <Sparkles size={48} className="text-kerala-green" />
           </div>
        </div>
        <h1 className="mt-6 text-3xl font-bold text-white tracking-tight animate-in slide-in-from-bottom-4 duration-700 delay-150">Kerala Lens</h1>
        <p className="mt-2 text-kerala-cream/80 text-sm font-medium animate-in slide-in-from-bottom-4 duration-700 delay-300">Your AI Travel Companion</p>
        <div className="mt-8 w-48 h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-kerala-gold w-1/3 animate-[shimmer_1s_infinite_linear]" style={{ width: '100%' }}></div>
        </div>
      </div>

      <div className={`min-h-screen bg-gray-50 text-gray-900 font-sans transition-opacity duration-700 ${showSplash ? 'opacity-0' : 'opacity-100'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
          <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
            <button 
               onClick={resetApp}
               className="flex items-center gap-2 active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 bg-kerala-green rounded-lg flex items-center justify-center text-white shadow-sm">
                 <Sparkles size={18} />
              </div>
              <h1 className="text-xl font-bold text-gray-800 tracking-tight">Kerala Lens</h1>
            </button>

            <button
              onClick={toggleHistory}
              className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-kerala-green hover:bg-gray-100 rounded-full transition-all active:scale-95"
              title="View History"
            >
              <History size={20} />
            </button>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 py-6 flex flex-col gap-6 pb-20">
          
          {/* Welcome / Instructions */}
          {appState === AppState.IDLE && (
            <div className="text-center mb-1 animate-in slide-in-from-top-4 duration-500">
              <h2 className="text-xl font-bold text-gray-800">Travel Translator</h2>
              <p className="text-sm text-gray-500">Point & Capture to translate instantly</p>
            </div>
          )}

          {/* Language Selector */}
          {appState !== AppState.ERROR && (
             <div className={`flex justify-center transition-opacity duration-300 ${appState === AppState.PROCESSING ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
               <LanguageSelector 
                 languages={LANGUAGES}
                 selectedLanguage={selectedLanguage}
                 onSelect={(lang) => {
                   setSelectedLanguage(lang);
                   if (result && appState === AppState.SUCCESS) {
                     handleReTranslation(lang.name);
                   } 
                   else if (selectedImage && (appState === AppState.SUCCESS || appState === AppState.IDLE)) {
                     handleImageSelected(selectedImage, lang.name);
                   }
                 }}
               />
             </div>
          )}

          {/* Main Content Area */}
          <div className="transition-all duration-300">
            
            {/* IDLE: Camera & History */}
            {appState === AppState.IDLE && (
              <div className="flex flex-col gap-8">
                <CameraInput 
                  onImageSelected={(base64) => handleImageSelected(base64)} 
                  isLoading={false} 
                />
                {historyLoaded && (
                  <HistoryList 
                    history={history} 
                    onSelect={handleHistorySelect} 
                    onClear={clearHistory} 
                  />
                )}
              </div>
            )}

            {/* PROCESSING: New "Scanning" Animation */}
            {appState === AppState.PROCESSING && (
              <div className="flex flex-col items-center justify-center py-16 gap-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative w-32 h-32 flex items-center justify-center">
                   {/* Expanding pulse rings */}
                   <div className="absolute inset-0 border-4 border-kerala-green/20 rounded-full animate-pulse-ring"></div>
                   <div className="absolute inset-0 border-4 border-kerala-green/20 rounded-full animate-pulse-ring" style={{ animationDelay: '1s' }}></div>
                   
                   {/* Core Icon */}
                   <div className="relative z-10 w-20 h-20 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                      {selectedImage ? (
                        <div className="w-full h-full relative">
                          <img src={selectedImage} className="w-full h-full object-cover opacity-50 blur-[2px]" />
                          <div className="absolute inset-0 bg-kerala-green/10"></div>
                          {/* Scanning bar animation */}
                          <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-transparent to-kerala-green/40 animate-scan-vertical border-b-2 border-kerala-green"></div>
                        </div>
                      ) : (
                        <BrainCircuit size={32} className="text-kerala-green animate-pulse" />
                      )}
                   </div>
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-gray-800 animate-pulse">
                    {processingStage === 'reading' ? 'Scanning Text...' : 'Translating...'}
                  </h3>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 font-medium">
                     <span className={`transition-opacity duration-300 ${processingStage === 'reading' ? 'opacity-100 text-kerala-green' : 'opacity-40'}`}>Detecting</span>
                     <span className="text-gray-300">•</span>
                     <span className={`transition-opacity duration-300 ${processingStage === 'translating' ? 'opacity-100 text-kerala-green' : 'opacity-40'}`}>Converting</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUCCESS: Result Card */}
            {appState === AppState.SUCCESS && result && (
              <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-8 duration-500">
                <TranslationCard result={result} />
                
                {selectedImage && (
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Original Image</p>
                     <div className="relative rounded-xl overflow-hidden aspect-video group">
                        <img src={selectedImage} alt="Source" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                     </div>
                  </div>
                )}

                <button
                  onClick={resetApp}
                  className="w-full py-4 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-kerala-green"
                >
                  <RefreshCw size={20} />
                  Translate Another
                </button>
              </div>
            )}

            {/* ERROR State */}
            {appState === AppState.ERROR && (
              <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center animate-in zoom-in-95 shadow-sm">
                <div className="w-16 h-16 bg-white text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-red-900 mb-2">Oops!</h3>
                <p className="text-red-600 mb-8 leading-relaxed">{errorMsg}</p>
                <button
                  onClick={resetApp}
                  className="w-full py-4 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 active:scale-95 transition-all"
                >
                  Try Again
                </button>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
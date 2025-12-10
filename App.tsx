import React, { useState, useEffect } from 'react';
import { CameraInput } from './components/CameraInput';
import { TranslationCard } from './components/TranslationCard';
import { LanguageSelector } from './components/LanguageSelector';
import { HistoryList } from './components/HistoryList';
import { translateImage, translateText } from './services/gemini';
import { TranslationResult, LanguageOption, AppState, HistoryItem } from './types';
import { RefreshCw, AlertTriangle, Sparkles, BrainCircuit } from 'lucide-react';

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
  
  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('kerala_lens_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load history", e);
      return [];
    }
  });

  // Save history to local storage whenever it changes
  useEffect(() => {
    try {
      // We don't save the image data to localStorage to avoid QuotaExceededError
      const historyToSave = history.map(({ imageUrl, ...rest }) => rest);
      localStorage.setItem('kerala_lens_history', JSON.stringify(historyToSave));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  }, [history]);

  const addToHistory = (translation: TranslationResult) => {
    const newItem: HistoryItem = {
      ...translation,
      id: Date.now().toString(),
      timestamp: Date.now(),
      // We intentionally don't save the base64 image to history to save space
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
    // History items in this implementation don't persist the image, so we clear it
    setSelectedImage(null);
    setAppState(AppState.SUCCESS);
  };

  // Heavy operation: Reads image and translates
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

  // Light operation: Uses existing text and just re-translates (FAST)
  const handleReTranslation = async (langName: string) => {
    if (!result) return;
    
    setAppState(AppState.PROCESSING);
    setProcessingStage('translating'); // Different visual cue
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-kerala-green rounded-lg flex items-center justify-center text-white">
               <Sparkles size={18} />
            </div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Kerala Lens</h1>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
        
        {/* Welcome / Instructions (only shown when Idle) */}
        {appState === AppState.IDLE && (
          <div className="text-center mb-2">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Travel Translator</h2>
            <p className="text-gray-500">Point your camera at street signs, menus, or notices to translate them instantly.</p>
          </div>
        )}

        {/* Language Selector - Smart Switching */}
        {appState !== AppState.ERROR && (
           <div className={`flex justify-center transition-opacity duration-300 ${appState === AppState.PROCESSING ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
             <LanguageSelector 
               languages={LANGUAGES}
               selectedLanguage={selectedLanguage}
               onSelect={(lang) => {
                 setSelectedLanguage(lang);
                 
                 // If we already have a successful result, perform FAST text-only re-translation
                 if (result && appState === AppState.SUCCESS) {
                   handleReTranslation(lang.name);
                 } 
                 // If we have an image but no result yet (or coming from error), perform full scan
                 else if (selectedImage && (appState === AppState.SUCCESS || appState === AppState.IDLE)) {
                   handleImageSelected(selectedImage, lang.name);
                 }
               }}
             />
           </div>
        )}

        {/* Main Content Area */}
        <div className="transition-all duration-300">
          
          {appState === AppState.IDLE && (
            <>
              <CameraInput 
                onImageSelected={(base64) => handleImageSelected(base64)} 
                isLoading={false} 
              />
              <HistoryList 
                history={history} 
                onSelect={handleHistorySelect} 
                onClear={clearHistory} 
              />
            </>
          )}

          {appState === AppState.PROCESSING && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                 <div className="w-16 h-16 border-4 border-gray-200 border-t-kerala-green rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    {processingStage === 'reading' ? (
                      <Sparkles size={20} className="text-kerala-green animate-pulse" />
                    ) : (
                      <BrainCircuit size={20} className="text-kerala-green animate-pulse" />
                    )}
                 </div>
              </div>
              <p className="text-lg font-medium text-gray-600 animate-pulse">
                {processingStage === 'reading' ? 'Reading Image...' : 'Translating Text...'}
              </p>
              {selectedImage && processingStage === 'reading' && (
                <div className="w-24 h-24 rounded-lg overflow-hidden shadow-sm opacity-50 mt-4">
                  <img src={selectedImage} alt="Processing" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          )}

          {appState === AppState.SUCCESS && result && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
              <TranslationCard result={result} />
              
              {selectedImage && (
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Original Image</p>
                   <div className="relative rounded-xl overflow-hidden aspect-video">
                      <img src={selectedImage} alt="Source" className="w-full h-full object-cover" />
                   </div>
                </div>
              )}

              <button
                onClick={resetApp}
                className="w-full py-4 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-gray-50"
              >
                <RefreshCw size={20} />
                Translate Another
              </button>
            </div>
          )}

          {appState === AppState.ERROR && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center animate-in zoom-in-95">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-red-800 mb-2">Something went wrong</h3>
              <p className="text-red-600 mb-6">{errorMsg}</p>
              <button
                onClick={resetApp}
                className="w-full py-3 bg-white border border-red-200 text-red-700 font-semibold rounded-xl hover:bg-red-50 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
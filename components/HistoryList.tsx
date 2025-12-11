import React, { useState, useEffect } from 'react';
import { HistoryItem } from '../types';
import { Clock, Trash2, ArrowRight, X, Check } from 'lucide-react';

interface HistoryListProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ history, onSelect, onClear }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset confirmation state if history changes (e.g. cleared)
  useEffect(() => {
    if (history.length === 0) {
      setShowConfirm(false);
    }
  }, [history.length]);

  return (
    <div id="history-section" className="w-full mt-4 pb-12 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Clock size={18} className="text-kerala-green" />
          Recent History
        </h3>
        
        {history.length > 0 && (
           showConfirm ? (
             <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                <span className="text-xs text-gray-500 font-medium">Clear all?</span>
                <button 
                  onClick={onClear} 
                  className="flex items-center gap-1 bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors text-xs font-bold"
                >
                  <Check size={12} /> Yes
                </button>
                <button 
                  onClick={() => setShowConfirm(false)} 
                  className="flex items-center gap-1 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium"
                >
                  <X size={12} /> No
                </button>
             </div>
           ) : (
            <button 
              onClick={() => setShowConfirm(true)}
              className="text-xs font-medium text-red-500 hover:text-red-700 flex items-center gap-1 py-1.5 px-3 rounded-lg hover:bg-red-50 transition-colors active:scale-95"
            >
              <Trash2 size={14} />
              Clear
            </button>
           )
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-white/50 border border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-opacity opacity-75 hover:opacity-100">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
               <Clock size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600">No translations yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[200px] leading-relaxed">
              Scan text to see your history build up here automatically.
            </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="group w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-kerala-green/30 transition-all text-left flex items-center justify-between active:scale-[0.98]"
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">
                  <span>{item.sourceLanguage}</span>
                  <ArrowRight size={10} />
                  <span className="text-kerala-green">{item.targetLanguage}</span>
                </div>
                <p className="font-bold text-gray-800 text-lg font-malayalam truncate">
                  {item.translatedText}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {item.detectedText}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                 <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                   {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                 </span>
                 <span className="text-xs text-gray-300 font-medium whitespace-nowrap">
                   {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
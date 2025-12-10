import React from 'react';
import { HistoryItem } from '../types';
import { Clock, Trash2, ArrowRight } from 'lucide-react';

interface HistoryListProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ history, onSelect, onClear }) => {
  if (history.length === 0) return null;

  return (
    <div className="w-full mt-8 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Clock size={18} className="text-kerala-green" />
          Recent History
        </h3>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if(window.confirm('Are you sure you want to clear your translation history?')) onClear();
          }}
          className="text-xs font-medium text-red-500 hover:text-red-700 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>

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
    </div>
  );
};
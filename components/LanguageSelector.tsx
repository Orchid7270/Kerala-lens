import React from 'react';
import { LanguageOption } from '../types';
import { ChevronDown } from 'lucide-react';

interface LanguageSelectorProps {
  selectedLanguage: LanguageOption;
  languages: LanguageOption[];
  onSelect: (lang: LanguageOption) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  languages,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative z-20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200 text-gray-800 font-medium active:scale-95 transition-transform"
      >
        <span className="text-sm">Translate to:</span>
        <span className="text-kerala-green font-bold">{selectedLanguage.name}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  onSelect(lang);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex flex-col ${
                  selectedLanguage.code === lang.code ? 'bg-green-50' : ''
                }`}
              >
                <span className="font-semibold text-gray-900">{lang.name}</span>
                <span className="text-gray-500 text-xs">{lang.nativeName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && (
        <div 
          className="fixed inset-0 z-[-1]" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
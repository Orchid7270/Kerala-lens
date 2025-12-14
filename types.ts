export interface Recommendation {
  name: string;
  description: string;
}

export interface EssentialPhrase {
  label: string;
  text: string;
  pronunciation: string;
}

export interface TranslationResult {
  detectedText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidenceScore?: number;
  recommendations?: Recommendation[];
  essentialPhrases?: EssentialPhrase[];
  travelTip?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export interface HistoryItem extends TranslationResult {
  id: string;
  timestamp: number;
  imageUrl?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
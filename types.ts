export interface TranslationResult {
  detectedText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidenceScore?: number;
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
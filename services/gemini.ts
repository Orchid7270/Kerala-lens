import { GoogleGenAI, Modality, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TranslationResult } from "../types";

const MODEL_NAME = 'gemini-2.5-flash';
const TTS_MODEL_NAME = 'gemini-2.5-flash-preview-tts';

// Simple in-memory cache for audio to prevent re-fetching
const ttsCache = new Map<string, ArrayBuffer>();

/**
 * Analyzes an image to detect text and translate it.
 */
export const translateImage = async (
  base64Image: string,
  targetLanguage: string
): Promise<TranslationResult> => {
  // Initialize AI client inside the function to ensure process.env.API_KEY is available
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // Extract real MIME type and data from the base64 string
    const match = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    
    let mimeType = "image/jpeg"; // Default fallback
    let data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    if (match) {
      mimeType = match[1];
      data = match[2];
    }

    // Updated prompt to be language-agnostic for better detection
    const systemInstruction = `You are an advanced AI visual translator.
    1. AUTOMATICALLY DETECT the language of the text visible in the image. It could be any language (Hindi, French, Spanish, English, Malayalam, etc.).
    2. Extract the text exactly as it appears.
    3. Translate the extracted text into ${targetLanguage}.
    4. CRITICAL EXCEPTION: If the detected text is ALREADY in ${targetLanguage}, translate it into English instead.
    5. Evaluate a Confidence Score (0-100) based on text clarity and visibility.
    6. Return the output strictly as a JSON object.`;

    const userPrompt = "Analyze this image, detect the source language, and provide the translation.";

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: data,
              },
            },
            { text: userPrompt },
          ],
        },
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedText: { type: Type.STRING, description: "The original text detected in the image" },
            translatedText: { type: Type.STRING, description: "The translated text" },
            sourceLanguage: { type: Type.STRING, description: "The detected language name (e.g. Hindi, French)" },
            targetLanguage: { type: Type.STRING, description: "The language the text was translated into" },
            confidenceScore: { type: Type.INTEGER, description: "Confidence score between 0 and 100" },
          },
          required: ["detectedText", "translatedText", "sourceLanguage", "targetLanguage", "confidenceScore"],
        },
      },
    });

    if (!response.text) {
        throw new Error("No response from model");
    }

    const result = JSON.parse(response.text);

    return {
      detectedText: result.detectedText || "No text detected",
      translatedText: result.translatedText || "Translation unavailable",
      sourceLanguage: result.sourceLanguage || "Unknown",
      targetLanguage: result.targetLanguage || targetLanguage,
      confidenceScore: result.confidenceScore || 0,
    };
  } catch (error) {
    console.error("Image Translation error:", error);
    throw error;
  }
};

/**
 * Translates existing text to a new language without re-processing the image.
 * This is much faster and saves bandwidth.
 */
export const translateText = async (
  text: string,
  currentSourceLanguage: string,
  targetLanguage: string,
  originalConfidence: number
): Promise<TranslationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const systemInstruction = `You are a professional translator.
    1. Translate the following text from ${currentSourceLanguage} to ${targetLanguage}.
    2. If the source text is already in ${targetLanguage}, translate it to English.
    3. Return JSON.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ text: text }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translatedText: { type: Type.STRING, description: "The translated text" },
            targetLanguage: { type: Type.STRING, description: "The language the text was translated into" },
          },
          required: ["translatedText", "targetLanguage"],
        },
      },
    });

    if (!response.text) {
       throw new Error("No response from model");
    }

    const result = JSON.parse(response.text);

    return {
      detectedText: text, // Keep original text
      translatedText: result.translatedText,
      sourceLanguage: currentSourceLanguage, // Keep original source language
      targetLanguage: result.targetLanguage || targetLanguage,
      confidenceScore: originalConfidence, // Keep original confidence
    };

  } catch (error) {
    console.error("Text Translation error:", error);
    throw error;
  }
};

/**
 * Generates audio for the provided text.
 */
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<ArrayBuffer> => {
  // Check Cache first
  const cacheKey = `${text}-${voiceName}`;
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey)!;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL_NAME,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ],
      },
    });

    const candidate = response.candidates?.[0];
    const base64Audio = candidate?.content?.parts?.[0]?.inlineData?.data;

    // Check for text refusal/error from model
    if (!base64Audio) {
      const textResponse = candidate?.content?.parts?.[0]?.text;
      if (textResponse) {
        throw new Error(`Model refused: ${textResponse}`);
      }
      throw new Error(`No audio data received. Status: ${candidate?.finishReason || 'Unknown'}`);
    }

    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Store in cache
    ttsCache.set(cacheKey, bytes.buffer);

    return bytes.buffer;
  } catch (error) {
    console.error("TTS error:", error);
    throw new Error("Failed to generate speech.");
  }
};
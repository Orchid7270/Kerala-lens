import { GoogleGenAI, Modality, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TranslationResult, EssentialPhrase } from "../types";

// STRICT CONFIGURATION AS REQUESTED:
// 1. Image/Text Analysis: Gemini 3.0 Pro (Best for reasoning/layouts)
const MODEL_NAME = 'gemini-3-pro-preview';

// 2. Audio Generation: Gemini 2.5 Flash TTS (3.0 does not support audio output)
const TTS_MODEL_NAME = 'gemini-2.5-flash-preview-tts';

// Simple in-memory cache for audio to prevent re-fetching
const ttsCache = new Map<string, ArrayBuffer>();

interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Analyzes an image to detect text and translate it using Gemini 3.0 Pro.
 * Now supports location-based recommendations.
 */
export const translateImage = async (
  base64Image: string,
  targetLanguage: string,
  location?: Coordinates | null
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

    const locString = location ? `Lat: ${location.lat}, Long: ${location.lng}` : "Unknown location";

    // Advanced prompt for Gemini 3.0 Pro with Location Context
    const systemInstruction = `You are an expert AI visual translator and travel guide utilizing Gemini 3.0 reasoning.

    YOUR MISSION:
    1. ANALYZE LAYOUT: Look at the image (menu, sign, document).
    2. DETECT LANGUAGE: Identify the source language.
    3. TRANSLATE: Translate the text to ${targetLanguage}.
       - Preserve the spatial layout (newlines, lists, prices) exactly.
       - Use advanced context reasoning for ambiguous terms.
       - If the detected text is ALREADY in ${targetLanguage}, translate it to English.
    4. TRAVEL RECOMMENDATIONS: 
       - User Location: ${locString}.
       - **STRATEGY**: Provide a diverse mix of **6 recommendations**:
         - **Spots 1-2**: Top rated tourist attractions near the User's GPS Location.
         - **Spots 3-4**: Hidden gems, local food spots, or cultural sites near the User.
         - **Spots 5-6**: **Text Context**: Analyze the detected text. If it mentions a specific place/city (e.g., "Bus to Munnar"), suggest spots in that destination. **IF NO PLACE is mentioned**, suggest trending spots in the broader region (State/Province).
       - Keep descriptions brief (under 15 words).
    5. TRAVEL TIP (Conversational Guidance):
       - Provide ONE short, friendly, practical conversational tip.
    6. ESSENTIAL PHRASES (Context-Aware):
       - Identify the **LOCAL SPOKEN LANGUAGE** of the User Location (e.g., Malayalam if in Kerala).
       - **ANALYZE IMAGE CONTEXT**: Determine if the image is a Restaurant Menu, Bus/Train Schedule, Road Sign, Warning, or General Text.
       - Provide 4 conversational phrases in the local language **SPECIFIC TO THIS CONTEXT**:
         - **If Menu**: Suggest "Which is the best dish?", "Is this spicy?", "Bill please", "Water please".
         - **If Transport/Sign**: Suggest "Where is the bus stop?", "How far is that place?", "When is the next bus?", "Ticket price?".
         - **If General/Unknown**: Fallback to "Hello", "Thank you", "Where is the bus stop?", "How much?".
       - Provide simple phonetic pronunciation.
    7. CONFIDENCE: Evaluate clarity (0-100).
    8. Return JSON.`;

    const userPrompt = "Analyze this image. Extract text, translate, and provide travel guide info including context-aware essential phrases.";

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
            detectedText: { type: Type.STRING, description: "Original text with layout preserved" },
            translatedText: { type: Type.STRING, description: "Translated text maintaining the layout" },
            sourceLanguage: { type: Type.STRING, description: "Detected language name" },
            targetLanguage: { type: Type.STRING, description: "Target language used" },
            confidenceScore: { type: Type.INTEGER, description: "0-100 score" },
            travelTip: { type: Type.STRING, description: "A short conversational or cultural tip" },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["name", "description"]
              }
            },
            essentialPhrases: {
              type: Type.ARRAY,
              description: "4 essential survival phrases based on context",
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "English meaning" },
                  text: { type: Type.STRING, description: "Local language text" },
                  pronunciation: { type: Type.STRING, description: "Phonetic pronunciation" }
                },
                required: ["label", "text", "pronunciation"]
              }
            }
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
      recommendations: result.recommendations || [],
      travelTip: result.travelTip,
      essentialPhrases: result.essentialPhrases || []
    };
  } catch (error) {
    console.error("Image Translation error:", error);
    throw error;
  }
};

/**
 * Translates existing text to a new language using Gemini 3.0 Pro.
 */
export const translateText = async (
  text: string,
  currentSourceLanguage: string,
  targetLanguage: string,
  originalConfidence: number,
  existingRecommendations?: any[], // Preserve recommendations
  existingEssentialPhrases?: EssentialPhrase[] // Preserve phrases
): Promise<TranslationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const systemInstruction = `You are a professional translator.
    1. Translate the following text from ${currentSourceLanguage} to ${targetLanguage}.
    2. Maintain all original line breaks and list formatting exactly.
    3. If the source text is already in ${targetLanguage}, translate it to English.
    4. Return JSON.`;

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
      recommendations: existingRecommendations, // Preserve recommendations
      essentialPhrases: existingEssentialPhrases, // Preserve phrases (they depend on location, not translation target)
      travelTip: undefined 
    };

  } catch (error) {
    console.error("Text Translation error:", error);
    throw error;
  }
};

/**
 * Generates MORE essential phrases based on the current list AND the scanned text context.
 */
export const getMoreEssentialPhrases = async (
  currentPhrases: EssentialPhrase[],
  scannedTextContext: string = ""
): Promise<EssentialPhrase[]> => {
  if (!currentPhrases || currentPhrases.length === 0) return [];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const contextStr = JSON.stringify(currentPhrases.map(p => ({ label: p.label, text: p.text })));
    const textSnippet = scannedTextContext.slice(0, 500); // Send first 500 chars of scanned text for context
    
    const systemInstruction = `You are a helpful travel guide.
    1. **CONTEXT**: The user scanned this text in a foreign land: "${textSnippet}...".
    2. **EXISTING PHRASES**: ${contextStr}.
    3. Identify the language of the existing phrases.
    4. Generate 4 NEW, DIFFERENT conversational phrases in that SAME language.
    5. **CRITICAL**: The phrases must be HIGHLY RELEVANT to the scanned text context.
       - If the scanned text looks like a **Food Menu**: suggest "Is this vegetarian?", "Which is spicy?", "Pack this please", "Best dessert?".
       - If the scanned text looks like a **Travel Schedule/Sign**: suggest "How far is that place?", "Which platform?", "Is it delayed?", "Ticket price?".
       - If the scanned text is **General**: suggest "Can you help me?", "I am lost", "Call Police".
    6. Return JSON.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ text: "Provide more context-aware phrases." }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            essentialPhrases: {
              type: Type.ARRAY,
              description: "4 new essential survival phrases",
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "English meaning" },
                  text: { type: Type.STRING, description: "Local language text" },
                  pronunciation: { type: Type.STRING, description: "Phonetic pronunciation" }
                },
                required: ["label", "text", "pronunciation"]
              }
            }
          },
          required: ["essentialPhrases"],
        },
      },
    });

    if (!response.text) throw new Error("No response");
    const result = JSON.parse(response.text);
    return result.essentialPhrases || [];

  } catch (error) {
    console.error("Get More Phrases error:", error);
    throw error;
  }
};

/**
 * Generates audio using Gemini 2.5 Flash TTS (Preview).
 */
export const generateSpeech = async (text: string, voiceName: string = 'Kore', retryCount = 0): Promise<ArrayBuffer> => {
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
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      },
    });

    const candidate = response.candidates?.[0];
    const base64Audio = candidate?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      const finishReason = candidate?.finishReason;
      if ((finishReason === 'OTHER' || finishReason === 'RECITATION') && retryCount < 1) {
         console.warn(`TTS Failed with reason ${finishReason}, retrying...`);
         return generateSpeech(text, voiceName, retryCount + 1);
      }
      throw new Error(`No audio data received. Status: ${finishReason || 'Unknown'}`);
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
  } catch (error: any) {
    const errorMsg = error.toString();
    if ((errorMsg.includes('500') || errorMsg.includes('Internal error')) && retryCount < 1) {
       await new Promise(resolve => setTimeout(resolve, 500));
       return generateSpeech(text, voiceName, retryCount + 1);
    }
    console.error("TTS error:", error);
    throw new Error("Failed to generate speech.");
  }
};
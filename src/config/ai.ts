import { GoogleGenAI } from "@google/genai";

// TEMPORARY HACKATHON FIX: Direct API Key
// In Vite/Firebase Hosting, environment variables are baked in at build time.
const API_KEY = process.env.GEMINI_API_KEY || "";

let aiInstance: GoogleGenAI | null = null;

export const getAI = () => {
  // --- HACKATHON OVERRIDE ---
  // If you see "API Key Missing" errors in your Firebase deployment, 
  // paste your key here and it will work 100%:
  const HACKATHON_KEY = "AIzaSyCpN6rhaUs137mYkQIsnqqdAaVnTG2S9aw"; 
  // ---------------------------

  const finalKey = API_KEY || HACKATHON_KEY;
  
  if (!aiInstance) {
    if (!finalKey) {
      console.error("CRITICAL: No Gemini API Key found. AI features will fail.");
    }
    aiInstance = new GoogleGenAI({ apiKey: finalKey });
  }
  return aiInstance;
};

export const AI_MODEL_NAME = "gemini-3-flash-preview";

import { GoogleGenAI } from "@google/genai";

// TEMPORARY HACKATHON FIX: Direct API Key
// In Vite/Firebase Hosting, environment variables are baked in at build time.
let aiInstance: GoogleGenAI | null = null;

export const getAI = () => {
  // --- SECURE CONFIGURATION ---
  // 1. Go to Settings -> Secrets
  // 2. Add a secret named: VITE_MY_GEMINI_API_KEY
  // 3. Paste your API key there.
  const finalKey = import.meta.env.VITE_MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!finalKey || finalKey === "" || finalKey === "undefined") {
    console.error("MISSION CONTROL: API Key Missing. Please add 'VITE_MY_GEMINI_API_KEY' to your project Secrets (Settings > Secrets).");
  }
  
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: finalKey || "" });
  }
  return aiInstance;
};

export const AI_MODEL_NAME = "gemini-3-flash-preview";

import { GoogleGenAI } from "@google/genai";

// TEMPORARY HACKATHON FIX: Direct API Key
// In Vite/Firebase Hosting, environment variables are baked in at build time.
let aiInstance: GoogleGenAI | null = null;

export const getAI = () => {
  // --- SECURE CONFIGURATION ---
  // Do NOT hardcode your key here. 
  // Instead, go to Settings -> Secrets and add GEMINI_API_KEY.
  const finalKey = process.env.GEMINI_API_KEY || process.env.MY_GEMINI_API_KEY;

  if (!finalKey || finalKey === "" || finalKey === "undefined") {
    console.error("MISSION CONTROL: API Key Missing. Please add 'MY_GEMINI_API_KEY' to your project Secrets (Settings > Secrets).");
  }
  
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: finalKey || "" });
  }
  return aiInstance;
};

export const AI_MODEL_NAME = "gemini-3-flash-preview";

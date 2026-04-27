import { GoogleGenAI } from "@google/genai";

// TEMPORARY HACKATHON FIX: Hardcoded API Key
// Replace the empty string with your valid Gemini API Key if the environment variable fails
const API_KEY = process.env.GEMINI_API_KEY || "";

let aiInstance: GoogleGenAI | null = null;

export const getAI = () => {
  if (!API_KEY || API_KEY === "" || API_KEY === "undefined") {
    console.warn("GEMINI_API_KEY is not defined. Features will fail until a key is provided.");
    // If you are in a hurry for the hackathon, you can literally paste your key here:
    // return new GoogleGenAI({ apiKey: "YOUR_PASTED_KEY_HERE" });
  }
  
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: API_KEY });
  }
  return aiInstance;
};

export const AI_MODEL_NAME = "gemini-3-flash-preview"; // Recommended model for this environment

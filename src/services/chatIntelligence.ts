import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not defined. Please check your environment variables.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const getChatIntelligence = async (
  messages: ChatMessage[], 
  context?: {
    tasks?: any[];
    userRole?: 'ngo' | 'volunteer';
    currentTask?: any;
  }
) => {
  try {
    const ai = getAI();
    
    const systemInstruction = `
      You are "Mission Control" for KarunaSync. 
      CRITICAL: Use the EXACT format below. Be extremely brief. No preambles. No conversational filler.

      FORMAT EXAMPLE:
      Task: [Objective Name]

      What to carry:
      - [Item 1]
      - [Item 2]

      How to work efficiently:
      - [Step 1]
      - [Step 2]

      Safety:
      - [Measure 1]

      RULES:
      1. Use bold headers for categories.
      2. Use bullet points (-) for items.
      3. Max 5 bullets per section.
      4. No "Hello", "Good luck", or "Based on your situation". Just the facts.

      Context:
      User Role: ${context?.userRole || 'User'}
      Current Objective: ${context?.currentTask?.title || 'Unknown'}
      Available Intel: ${context?.tasks?.map(t => t.title).join(', ') || 'N/A'}
    `;

    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction,
      }
    });

    // Send the history first, then the latest message
    // Note: In a real app we'd maintain the chat object, but for simplicity here we'll send the prompt
    // and let Gemini handle the logic. 
    
    // We'll just use generateContent for this simple stateless implementation or 
    // we could persist the chat instance if needed.
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      config: {
        systemInstruction,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Chat Intelligence Error:", error);
    if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
      return "Critical: Gemini API Key missing. Please configure it in Settings.";
    }
    return "I'm having trouble connecting to Mission Control. Please try again in a moment.";
  }
};

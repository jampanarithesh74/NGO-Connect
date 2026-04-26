import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "undefined" || key === "null") {
    throw new Error("GEMINI_API_KEY is not defined. Please check project Secrets.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

export const generateTaskDetails = async (title: string, description: string) => {
  const ai = getAI();
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this NGO task and provide recommended team size, minimum members, and a checklist of required skills and equipment.
    Task Title: ${title}
    Task Description: ${description}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedTeamSize: { type: Type.NUMBER },
          minMembers: { type: Type.NUMBER },
          checklist: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["recommendedTeamSize", "minMembers", "checklist"]
      }
    }
  });

  try {
    return JSON.parse(result.text!);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return {
      recommendedTeamSize: 3,
      minMembers: 1,
      checklist: ["Basic coordination", "Mobile phone"]
    };
  }
};

import { Type } from "@google/genai";
import { getAI, AI_MODEL_NAME } from "../config/ai";

export const generateTaskDetails = async (title: string, description: string) => {
  try {
    const ai = getAI();
    const prompt = `Analyze this NGO task and provide recommended team size, minimum members, and a checklist of required skills and equipment.
    Task Title: ${title}
    Task Description: ${description}`;

    const response = await ai.models.generateContent({
      model: AI_MODEL_NAME,
      contents: prompt,
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

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to generate AI task details", e);
    return {
      recommendedTeamSize: 3,
      minMembers: 1,
      checklist: ["Basic coordination", "Mobile phone"]
    };
  }
};

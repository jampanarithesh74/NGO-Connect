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

    const serverResponse = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt: messages[messages.length - 1].text,
        systemInstruction,
        history: messages.slice(0, -1).map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      })
    });

    if (!serverResponse.ok) {
      const errorData = await serverResponse.json();
      throw new Error(errorData.error || "Server failed to process chat intelligence.");
    }

    const { result: text } = await serverResponse.json();
    return text;
  } catch (error) {
    console.error("Chat Intelligence Error:", error);
    return "I'm having trouble connecting to Mission Control. Please try again in a moment.";
  }
};

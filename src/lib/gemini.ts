export const generateTaskDetails = async (title: string, description: string) => {
  try {
    const prompt = `Analyze this NGO task and provide recommended team size, minimum members, and a checklist of required skills and equipment.
    Task Title: ${title}
    Task Description: ${description}`;

    const serverResponse = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!serverResponse.ok) {
      const errorData = await serverResponse.json();
      throw new Error(errorData.error || "Server failed to analyze task details.");
    }

    const { result: text } = await serverResponse.json();
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to generate AI task details", e);
    return {
      recommendedTeamSize: 3,
      minMembers: 1,
      checklist: ["Basic coordination", "Mobile phone"]
    };
  }
};

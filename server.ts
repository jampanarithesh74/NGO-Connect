import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for images/reports
  app.use(express.json({ limit: "10mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const { prompt, fileData, systemInstruction, history } = req.body;
      const key = process.env.GEMINI_API_KEY;

      if (!key || key === "" || key === "undefined" || key === "null") {
        console.error("GEMINI_API_KEY is missing or invalid in server environment.");
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not properly configured. Please ensure it is set in your project Secrets." 
        });
      }

      const genAI = new GoogleGenAI({ apiKey: key });

      const parts: any[] = [];
      
      // If we have history (for chat), we use it differently, 
      // but for simple consistency we'll stick to contents array
      
      const contents: any[] = [];
      
      if (history && Array.isArray(history)) {
        contents.push(...history);
      }

      const currentParts: any[] = [{ text: prompt }];
      
      if (fileData) {
        currentParts.push({
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType
          }
        });
      }

      contents.push({ role: "user", parts: currentParts });

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: systemInstruction || undefined,
          responseMimeType: "application/json",
        }
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Internal Server Error",
        details: error.response?.data || error
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

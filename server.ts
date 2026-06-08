import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const tools = [
  {
    functionDeclarations: [
      {
        name: "size_cstr",
        description: "Calculate the required volume of a CSTR for a target conversion.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            F_A0: { type: Type.NUMBER, description: "Feed molar flow rate in mol/s" },
            C_A0: { type: Type.NUMBER, description: "Feed concentration in mol/m³" },
            k: { type: Type.NUMBER, description: "Reaction rate constant in 1/s" },
            X_target: { type: Type.NUMBER, description: "Target conversion (0 to 1)" },
          },
          required: ["F_A0", "C_A0", "k", "X_target"],
        },
      },
      {
        name: "size_pfr",
        description: "Calculate the required volume of a PFR for a target conversion.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            F_A0: { type: Type.NUMBER, description: "Feed molar flow rate in mol/s" },
            C_A0: { type: Type.NUMBER, description: "Feed concentration in mol/m³" },
            k: { type: Type.NUMBER, description: "Reaction rate constant in 1/s" },
            X_target: { type: Type.NUMBER, description: "Target conversion (0 to 1)" },
          },
          required: ["F_A0", "C_A0", "k", "X_target"],
        },
      },
      {
        name: "conversion_in_cstr",
        description: "Calculate the conversion achieved in a CSTR of a given volume.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            F_A0: { type: Type.NUMBER, description: "Feed molar flow rate in mol/s" },
            C_A0: { type: Type.NUMBER, description: "Feed concentration in mol/m³" },
            k: { type: Type.NUMBER, description: "Reaction rate constant in 1/s" },
            V: { type: Type.NUMBER, description: "Reactor volume in m³" },
          },
          required: ["F_A0", "C_A0", "k", "V"],
        },
      },
      {
        name: "conversion_in_pfr",
        description: "Calculate the conversion achieved in a PFR of a given volume.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            F_A0: { type: Type.NUMBER, description: "Feed molar flow rate in mol/s" },
            C_A0: { type: Type.NUMBER, description: "Feed concentration in mol/m³" },
            k: { type: Type.NUMBER, description: "Reaction rate constant in 1/s" },
            V: { type: Type.NUMBER, description: "Reactor volume in m³" },
          },
          required: ["F_A0", "C_A0", "k", "V"],
        },
      },
    ],
  },
];

// In-memory store for simple prototyping.
const sessions: Record<string, {
  history: any[],
  reactorState: any
}> = {};

const systemInstruction = `You are an AI assistant for chemical engineering students to size and analyze chemical reactors.
Use the provided tools to solve the user's problem. Always explain the result simply and clearly.

If the user gives you a problem to size or analyze a reactor, always use the tools.
Do not calculate by hand. Ensure all units match (SI: mol/s, mol/m³, 1/s, m³).
After tool call, summarize the results naturally. 
Important: Format all math expressions using LaTeX with $ for inline math and $$ for block math.`;

function evaluateSizeCSTR({ F_A0, C_A0, k, X_target }: any) {
  const V = (F_A0 * X_target) / (k * C_A0 * (1 - X_target));
  const validConversion = X_target >= 0 && X_target < 1;
  const positiveVolume = V > 0;
  return {
    V, validConversion, positiveVolume, ok: validConversion && positiveVolume
  };
}

function evaluateSizePFR({ F_A0, C_A0, k, X_target }: any) {
  const V = -(F_A0 / (k * C_A0)) * Math.log(1 - X_target);
  const profile = [];
  for (let i = 0; i <= 20; i++) {
    const v_step = (V * i) / 20;
    const x_step = 1 - Math.exp(-(k * C_A0 * v_step) / F_A0);
    profile.push({ volume: v_step, conversion: x_step });
  }
  const validConversion = X_target >= 0 && X_target < 1;
  const positiveVolume = V > 0;
  return { V, profile, validConversion, positiveVolume, ok: validConversion && positiveVolume };
}

function evaluateConversionCSTR({ F_A0, C_A0, k, V }: any) {
  const X = (k * C_A0 * V) / (F_A0 + k * C_A0 * V);
  const validConversion = X >= 0 && X <= 1;
  const positiveVolume = V > 0;
  return { X, validConversion, positiveVolume, ok: validConversion && positiveVolume };
}

function evaluateConversionPFR({ F_A0, C_A0, k, V }: any) {
  const X = 1 - Math.exp(-(k * C_A0 * V) / F_A0);
  const profile = [];
  for (let i = 0; i <= 20; i++) {
    const v_step = (V * i) / 20;
    const x_step = 1 - Math.exp(-(k * C_A0 * v_step) / F_A0);
    profile.push({ volume: v_step, conversion: x_step });
  }
  const validConversion = X >= 0 && X <= 1;
  const positiveVolume = V > 0;
  return { X, profile, validConversion, positiveVolume, ok: validConversion && positiveVolume };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      
      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          history: [],
          reactorState: null
        };
      }
      
      const session = sessions[sessionId];
      
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        history: session.history,
        config: {
          systemInstruction,
          tools
        }
      });
      
      let generationResponse = await chat.sendMessage({ message });
      
      let functionCalls = generationResponse.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        let toolResponse: any = {};
        
        try {
          const args = call.args as any;
          if (call.name === "size_cstr") {
            const result = evaluateSizeCSTR(args);
            toolResponse = result;
            session.reactorState = {
              type: "CSTR",
              volume: result.V,
              conversion: args.X_target,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok
            };
          } else if (call.name === "size_pfr") {
            const result = evaluateSizePFR(args);
            toolResponse = result;
            session.reactorState = {
              type: "PFR",
              volume: result.V,
              conversion: args.X_target,
              profile: result.profile,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok
            };
          } else if (call.name === "conversion_in_cstr") {
            const result = evaluateConversionCSTR(args);
            toolResponse = result;
            session.reactorState = {
              type: "CSTR",
              volume: args.V,
              conversion: result.X,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok
            };
          } else if (call.name === "conversion_in_pfr") {
            const result = evaluateConversionPFR(args);
            toolResponse = result;
            session.reactorState = {
              type: "PFR",
              volume: args.V,
              conversion: result.X,
              profile: result.profile,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok
            };
          }
        } catch (e: any) {
          toolResponse = { error: e.message };
        }
        
        generationResponse = await chat.sendMessage({
           message: [{
             functionResponse: {
               id: call.id,
               name: call.name,
               response: toolResponse
             }
           }] as any 
        });
        functionCalls = generationResponse.functionCalls;
      }
      
      const historyResponse = await chat.getHistory();
      session.history = historyResponse;

      // Extract client facing chat messages
      const clientHistory = session.history.map((turn: any) => {
         const textParts = turn.parts.filter((p: any) => p.text);
         if (textParts.length > 0) {
           return {
             id: Math.random().toString(),
             role: turn.role,
             content: textParts.map((p: any) => p.text).join("\n")
           };
         }
         return null;
      }).filter(Boolean);
      
      res.json({
        history: clientHistory,
        reactorState: session.reactorState
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
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
    console.log("Server running on http://localhost:" + PORT);
  });
}

startServer();

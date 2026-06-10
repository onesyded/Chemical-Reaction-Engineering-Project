import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  sizeCSTR,
  sizePFR,
  conversionInCSTR,
  conversionInPFR,
} from "./src/solvers";

dotenv.config();

// Model is env-configurable. Default gemini-2.5-flash-lite: the fastest free-tier Flash model —
// plenty for picking one of four tools and extracting numbers, and it keeps responses snappy.
// Falls back to gemini-2.5-flash (more capable) on overload. gemini-3.5-flash is the most capable
// but is frequently 503-overloaded on the free tier, so it's opt-in via GEMINI_MODEL.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODELS = Array.from(new Set([MODEL, "gemini-2.5-flash"]));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isTransientOverload(e: any): boolean {
  const s = e?.status ?? e?.code;
  const msg = String(e?.message ?? e);
  return s === 503 || s === 429 || /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Shared parameter blocks for the four solver tools.
const baseProps = {
  F_A0: { type: Type.NUMBER, description: "Feed molar flow rate of A in mol/s" },
  C_A0: { type: Type.NUMBER, description: "Feed concentration of A in mol/m³" },
  k: { type: Type.NUMBER, description: "Reaction rate constant (1/s for first order)" },
  order: {
    type: Type.NUMBER,
    description: "Reaction order n (defaults to 1 if the user does not specify)",
  },
};

const tools = [
  {
    functionDeclarations: [
      {
        name: "size_cstr",
        description:
          "Calculate the required volume of a CSTR to reach a target conversion for the reaction A → B.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            ...baseProps,
            X_target: { type: Type.NUMBER, description: "Target conversion, strictly between 0 and 1" },
          },
          required: ["F_A0", "C_A0", "k", "X_target"],
        },
      },
      {
        name: "size_pfr",
        description:
          "Calculate the required volume of a PFR to reach a target conversion for the reaction A → B.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            ...baseProps,
            X_target: { type: Type.NUMBER, description: "Target conversion, strictly between 0 and 1" },
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
            ...baseProps,
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
            ...baseProps,
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

const systemInstruction = `You are an AI copilot for chemical engineering students. You help size and analyse isothermal chemical reactors (CSTR and PFR) for the single reaction A → B.

CRITICAL RULES:
1. NEVER do the reactor arithmetic yourself. ALWAYS call a tool — the tools are the only source of truth.
2. If the user has not provided every required input, DO NOT guess or assume values. Ask one short, specific clarifying question naming exactly which inputs are missing.
   - Sizing a reactor (size_cstr / size_pfr) needs: F_A0 (mol/s), C_A0 (mol/m³), k, and X_target (0–1).
   - Finding conversion (conversion_in_cstr / conversion_in_pfr) needs: F_A0, C_A0, k, and V (m³).
3. Reaction order defaults to 1 (first order) unless the user states otherwise.
4. All inputs and outputs are SI: mol/s, mol/m³, m³, 1/s.
5. After a tool returns, check the "ok" field:
   - If ok is true, report the result clearly and explain briefly what it means.
   - If ok is false, DO NOT present a number as a valid answer. Explain the problem using the "error" field and ask the user to correct the input.
6. Briefly explain which reactor model and design equation applies, and why, in plain language a student can follow.
7. Format ALL math using LaTeX: $...$ for inline and $$...$$ for block equations.

Be concise and friendly — a knowledgeable lab partner, not a textbook.`;

// Sweep a CSTR's volume to produce a design curve (conversion vs volume) for the
// plot. Each point is computed by the verified solver, not approximated here.
function buildCSTRProfile(F_A0: number, C_A0: number, k: number, order: number, V_total: number) {
  const profile: { volume: number; conversion: number }[] = [];
  const V_max = V_total * 1.5; // show the operating point with context on either side
  const points = 40;
  for (let i = 0; i <= points; i++) {
    const v = (V_max * i) / points;
    if (v <= 0) {
      profile.push({ volume: 0, conversion: 0 });
      continue;
    }
    const res = conversionInCSTR({ F_A0, C_A0, k, V: v, order });
    const x = isFinite(res.X) ? res.X : 0;
    profile.push({ volume: v, conversion: Math.max(0, Math.min(1, x)) });
  }
  return profile;
}

// Send a message on an existing chat, retrying transient overload (503/429) on the same model.
async function sendWithRetry(chat: any, payload: any, attempts = 3) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chat.sendMessage(payload);
    } catch (e) {
      lastErr = e;
      if (!isTransientOverload(e)) throw e;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

// Start a chat for the first user message, walking the fallback model list on overload.
async function startChat(history: any[], message: any) {
  let lastErr: any;
  for (const model of FALLBACK_MODELS) {
    const chat = ai.chats.create({ model, history, config: { systemInstruction, tools } });
    try {
      const response = await sendWithRetry(chat, { message }, 2);
      return { chat, response, model };
    } catch (e) {
      lastErr = e;
      if (!isTransientOverload(e)) throw e; // genuine error (bad key/request) — stop, don't mask it
      // otherwise try the next, lighter model
    }
  }
  throw lastErr;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 3000;

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

      const { chat, response: firstResponse } = await startChat(session.history, message);
      let generationResponse = firstResponse;

      let functionCalls = generationResponse.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        let toolResponse: any = {};

        try {
          const args = call.args as any;
          const order = args.order ?? 1;

          if (call.name === "size_cstr") {
            const result = sizeCSTR(args);
            toolResponse = result;
            session.reactorState = {
              type: "CSTR",
              volume: result.V,
              conversion: args.X_target,
              order,
              k: args.k,
              F_A0: args.F_A0,
              C_A0: args.C_A0,
              profile: result.ok
                ? buildCSTRProfile(args.F_A0, args.C_A0, args.k, order, result.V)
                : undefined,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok,
              error: result.error,
            };
          } else if (call.name === "size_pfr") {
            const result = sizePFR(args);
            toolResponse = result;
            session.reactorState = {
              type: "PFR",
              volume: result.V,
              conversion: args.X_target,
              order,
              k: args.k,
              F_A0: args.F_A0,
              C_A0: args.C_A0,
              profile: result.profile,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok,
              error: result.error,
            };
          } else if (call.name === "conversion_in_cstr") {
            const result = conversionInCSTR(args);
            toolResponse = result;
            session.reactorState = {
              type: "CSTR",
              volume: args.V,
              conversion: result.X,
              order,
              k: args.k,
              F_A0: args.F_A0,
              C_A0: args.C_A0,
              profile: result.ok
                ? buildCSTRProfile(args.F_A0, args.C_A0, args.k, order, args.V)
                : undefined,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok,
              error: result.error,
            };
          } else if (call.name === "conversion_in_pfr") {
            const result = conversionInPFR(args);
            toolResponse = result;
            session.reactorState = {
              type: "PFR",
              volume: args.V,
              conversion: result.X,
              order,
              k: args.k,
              F_A0: args.F_A0,
              C_A0: args.C_A0,
              profile: result.profile,
              checks: { validConversion: result.validConversion, positiveVolume: result.positiveVolume },
              ok: result.ok,
              error: result.error,
            };
          }
        } catch (e: any) {
          toolResponse = { ok: false, error: e.message };
        }

        generationResponse = await sendWithRetry(chat, {
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

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

// Model is env-configurable. Default gemini-2.5-flash: reliable tool-calling (the whole product
// depends on it actually calling the verified solvers) while staying fast. gemini-2.5-flash-lite
// is faster but flaky at tool-calling on terse prompts, so it's only a fallback. gemini-3.5-flash
// is the most capable but frequently 503-overloaded on the free tier, so it's opt-in via GEMINI_MODEL.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = Array.from(new Set([MODEL, "gemini-2.5-flash-lite"]));

// Deliberate beat between the reactor building in the viz and the explanation
// starting in the chat (tune to taste). Eventually this is the seam where a
// dedicated "explainer agent" takes over.
const REACTOR_BEAT_MS = 600;

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
2. If ALL required inputs are present, call the tool IMMEDIATELY — never ask the user to confirm values they already gave. If any required input is missing, DO NOT guess: ask one short, specific question naming exactly which inputs are missing.
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

// Run one solver tool call. Returns the raw result (fed back to the model) and the
// reactorState the UI renders. Shared by the buffered and streaming endpoints.
function runToolCall(call: any): { toolResponse: any; reactorState: any } {
  try {
    const args = call.args as any;
    const order = args.order ?? 1;
    const common = { order, k: args.k, F_A0: args.F_A0, C_A0: args.C_A0 };

    if (call.name === "size_cstr") {
      const r = sizeCSTR(args);
      return { toolResponse: r, reactorState: {
        type: "CSTR", volume: r.V, conversion: args.X_target, ...common,
        profile: r.ok ? buildCSTRProfile(args.F_A0, args.C_A0, args.k, order, r.V) : undefined,
        checks: { validConversion: r.validConversion, positiveVolume: r.positiveVolume }, ok: r.ok, error: r.error,
      } };
    }
    if (call.name === "size_pfr") {
      const r = sizePFR(args);
      return { toolResponse: r, reactorState: {
        type: "PFR", volume: r.V, conversion: args.X_target, ...common,
        profile: r.profile,
        checks: { validConversion: r.validConversion, positiveVolume: r.positiveVolume }, ok: r.ok, error: r.error,
      } };
    }
    if (call.name === "conversion_in_cstr") {
      const r = conversionInCSTR(args);
      return { toolResponse: r, reactorState: {
        type: "CSTR", volume: args.V, conversion: r.X, ...common,
        profile: r.ok ? buildCSTRProfile(args.F_A0, args.C_A0, args.k, order, args.V) : undefined,
        checks: { validConversion: r.validConversion, positiveVolume: r.positiveVolume }, ok: r.ok, error: r.error,
      } };
    }
    if (call.name === "conversion_in_pfr") {
      const r = conversionInPFR(args);
      return { toolResponse: r, reactorState: {
        type: "PFR", volume: args.V, conversion: r.X, ...common,
        profile: r.profile,
        checks: { validConversion: r.validConversion, positiveVolume: r.positiveVolume }, ok: r.ok, error: r.error,
      } };
    }
    return { toolResponse: { ok: false, error: `Unknown tool ${call.name}` }, reactorState: null };
  } catch (e: any) {
    return { toolResponse: { ok: false, error: e.message }, reactorState: null };
  }
}

// Friendly, no-plumbing description of a tool call for the live trace (the args are the
// user's own inputs, shown as readable engineering — never raw JSON or internals).
function toolTrace(call: any): { label: string; detail: string } {
  const a = (call.args ?? {}) as any;
  const kind = call.name.includes("cstr") ? "CSTR" : "PFR";
  const prefix = (a.order ?? 1) === 1 ? "" : `${a.order}-order · `;
  if (call.name.startsWith("size")) {
    return {
      label: `Sizing the ${kind} with the verified solver`,
      detail: `${prefix}F_A0 = ${a.F_A0} mol/s · C_A0 = ${a.C_A0} mol/m³ · k = ${a.k} · target X = ${Math.round((a.X_target ?? 0) * 100)}%`,
    };
  }
  return {
    label: `Finding conversion in the ${kind} with the verified solver`,
    detail: `${prefix}F_A0 = ${a.F_A0} mol/s · C_A0 = ${a.C_A0} mol/m³ · k = ${a.k} · V = ${a.V} m³`,
  };
}

// Map Gemini history to the client's text-only chat messages.
function toClientHistory(history: any[]) {
  return history.map((turn: any) => {
    const textParts = (turn.parts || []).filter((p: any) => p.text);
    if (textParts.length === 0) return null;
    return { id: Math.random().toString(), role: turn.role, content: textParts.map((p: any) => p.text).join("\n") };
  }).filter(Boolean);
}

// Split text into small tokens for a typewriter reveal over SSE.
function chunkText(s: string): string[] {
  return s.match(/\S+\s*/g) ?? [];
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

// Same as startChat, but emits a 'busy' note to the live trace on each overload retry.
async function startChatStreaming(history: any[], message: any, emit: (e: any) => void) {
  let lastErr: any;
  for (let mi = 0; mi < FALLBACK_MODELS.length; mi++) {
    const model = FALLBACK_MODELS[mi];
    const chat = ai.chats.create({ model, history, config: { systemInstruction, tools } });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await chat.sendMessage({ message });
        return { chat, response };
      } catch (e) {
        lastErr = e;
        if (!isTransientOverload(e)) throw e;
        emit({ type: "stage", id: `busy-${mi}-${attempt}`, label: "Model busy — retrying…", status: "done", warn: true });
        await sleep(700);
      }
    }
  }
  throw lastErr;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 3000;

  // Buffered endpoint (kept as a fallback for non-streaming clients).
  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      if (!sessions[sessionId]) sessions[sessionId] = { history: [], reactorState: null };
      const session = sessions[sessionId];

      const { chat, response: firstResponse } = await startChat(session.history, message);
      let generationResponse = firstResponse;

      let functionCalls = generationResponse.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        const { toolResponse, reactorState } = runToolCall(call);
        if (reactorState) session.reactorState = reactorState;
        generationResponse = await sendWithRetry(chat, {
          message: [{ functionResponse: { id: call.id, name: call.name, response: toolResponse } }] as any,
        });
        functionCalls = generationResponse.functionCalls;
      }

      session.history = await chat.getHistory();
      res.json({ history: toClientHistory(session.history), reactorState: session.reactorState });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Streaming endpoint: emits the agent's real steps live as Server-Sent Events.
  app.post("/api/chat/stream", async (req, res) => {
    const { sessionId, message } = req.body;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (res as any).flushHeaders?.();
    const emit = (e: any) => res.write(`data: ${JSON.stringify(e)}\n\n`);

    try {
      if (!sessions[sessionId]) sessions[sessionId] = { history: [], reactorState: null };
      const session = sessions[sessionId];

      emit({ type: "stage", id: "reason", label: "Understanding your request", status: "active" });
      const { chat, response: first } = await startChatStreaming(session.history, message, emit);
      emit({ type: "stage", id: "reason", status: "done" });
      let generationResponse = first;

      let usedTool = false;
      let functionCalls = generationResponse.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        usedTool = true;
        const call = functionCalls[0];
        const t = toolTrace(call);
        emit({ type: "stage", id: "tool", label: t.label, detail: t.detail, status: "active" });

        const { toolResponse, reactorState } = runToolCall(call);
        if (reactorState) session.reactorState = reactorState;

        emit({ type: "stage", id: "tool", status: "done" });
        emit({
          type: "stage",
          id: "verify",
          label: toolResponse?.ok ? "Verified — 0 ≤ X ≤ 1, V > 0" : "Check failed — inputs rejected",
          status: "done",
          ok: !!toolResponse?.ok,
          warn: !toolResponse?.ok,
        });
        // Build the reactor in the viz now — before we explain it in the chat.
        emit({ type: "reactor", reactorState: session.reactorState });
        await sleep(REACTOR_BEAT_MS); // let the reactor land before the words start
        emit({ type: "stage", id: "explain", label: "Explaining the result", status: "active" });

        generationResponse = await sendWithRetry(chat, {
          message: [{ functionResponse: { id: call.id, name: call.name, response: toolResponse } }] as any,
        });
        functionCalls = generationResponse.functionCalls;
      }
      if (usedTool) emit({ type: "stage", id: "explain", status: "done" });

      // Stream the final explanation token-by-token for a live typewriter feel.
      const finalText = (generationResponse as any).text ?? "";
      for (const piece of chunkText(finalText)) {
        emit({ type: "delta", text: piece });
        await sleep(12);
      }

      session.history = await chat.getHistory();
      emit({ type: "result", history: toClientHistory(session.history), reactorState: session.reactorState });
      res.end();
    } catch (error: any) {
      console.error(error);
      emit({
        type: "error",
        message: isTransientOverload(error)
          ? "The models are busy right now — please try again in a moment."
          : error.message || "Something went wrong.",
      });
      res.end();
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

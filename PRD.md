# Product Requirements Document  
## AI Copilot for Reaction Engineering — Version 1

**Project:** MODELLING CLUB · KNUST  
**Status:** In Development  
**Last Updated:** 2026-06-10

---

## 1. Vision

A student describes a reactor problem in plain language — "size a reactor to convert 90% of A into B" — and an AI agent works out what to compute, runs verified engineering math, and returns the answer as numbers, a plot, and a reactor schematic. Think less *calculator*, more *knowledgeable lab partner*.

**The product is defined by three commitments:**
1. **Correct before clever** — solvers are verified; the agent never does arithmetic in its head.
2. **Explainable end to end** — every number traces back to a tool call the user can inspect.
3. **Visualization is the centrepiece** — the viz panel dominates; chat is the input, not the output.

---

## 2. Architecture — Three Layers

```
User (plain language)
        ↓
Layer 1 · Reasoning   — LLM agent (Gemini): parse goal → decide tool → explain result
        ↓ ↑
Layer 2 · Solvers     — prebuilt, verified reactor math (our tools)
        ↓
Layer 3 · Visualize   — plots, schematic, light animation
        ↓
User (numbers + visuals)
```

The agent **never** computes reactor math itself. It only calls tools. This separation is the whole product.

---

## 3. V1 Scope

| Dimension | V1 Value |
|-----------|----------|
| Reaction | A → B (single, first-order, isothermal) |
| Reactors | CSTR and PFR only |
| Kinetics | First-order: $-r_A = k C_A$ |
| Mode | Sizing (given X, find V) and Analysis (given V, find X) |
| Series | No (single reactor only) |
| Thermodynamics | No (isothermal assumed) |
| Optimisation | No |
| Units | SI only (mol/s, mol/m³, 1/s, m³) |

**What V1 deliberately excludes:** multiple reactions, energy balances, pressure drop, DWSIM/Aspen/MATLAB, on-the-fly tool creation, optimisation.

---

## 4. Solvers (Layer 2)

Each solver is a fixed, verified function. The agent calls them; it never approximates.

### 4.1 Four required tools

| Tool | Inputs | Output | Equation |
|------|--------|--------|----------|
| `size_cstr` | F_A0, C_A0, k, X_target | V | $V = \frac{F_{A0} \cdot X}{k C_{A0}(1-X)}$ |
| `size_pfr` | F_A0, C_A0, k, X_target | V, profile[] | $V = \frac{F_{A0}}{k C_{A0}} \ln\!\frac{1}{1-X}$ |
| `conversion_in_cstr` | F_A0, C_A0, k, V | X | derived from CSTR design equation |
| `conversion_in_pfr` | F_A0, C_A0, k, V | X, profile[] | derived from PFR design equation |

### 4.2 Self-verification checks (every solver call)

Every tool result must include and the agent must surface:
- `validConversion`: 0 ≤ X ≤ 1
- `positiveVolume`: V > 0
- `ok`: both checks pass

If `ok` is false, the agent must **not** show a result as valid — it surfaces the error.

### 4.3 Responsibility

**Teammate** owns the solver implementations and their verification logic.  
**Interface contract** (what the agent expects back) is fixed in `types.ts` — changes to the interface require both parties to agree.

---

## 5. AI Agent (Layer 1)

### 5.1 Behaviour

- Parses natural-language input to identify: reactor type, mode (size vs analyse), and parameter values.
- Asks clarifying questions if required parameters are missing (e.g., "What is the feed concentration C_A0?").
- Calls exactly one tool per problem (no arithmetic in its head).
- After tool call: summarises result in plain English with LaTeX math ($...$ inline, $$...$$ block).
- Maintains conversation history within a session.

### 5.2 System prompt requirements

- Must instruct the model to always use tools; never approximate.
- Must enforce SI units.
- Must explain the chosen reactor and why.
- Must surface verification status (`ok` flag) in its explanation.

### 5.3 Model

- Current: Gemini (via `@google/genai`)
- Model string must be kept in a single env-configurable constant (not scattered across the code).

### 5.4 Session memory

- Conversation history is per-session, in-memory for V1.
- `reactorState` (last solver result) persists per session so the viz panel stays in sync.

---

## 6. Visualisation (Layer 3)

Three tiers, in order of priority:

### Tier 1 — Conversion plot (required for V1 launch)

- X-axis: Reactor volume (m³), Y-axis: Conversion (0–1)
- PFR: smooth line from solver profile data (along-reactor conversion profile)
- CSTR: a design-sweep curve (conversion vs reactor volume, computed by repeated solver calls) with the chosen operating point highlighted — shows the diminishing-returns trade-off rather than a bare dot
- Operating point always shown as a coloured reference dot
- Must be accurate — drawn from solver output, never approximated

### Tier 2 — Reactor schematic (required for V1 launch)

- PFR: horizontal tube with colour gradient (green-to-dark) showing conversion rise; animated particles flowing left-to-right
- CSTR: tank with rotating stirrer; solid fill indicating well-mixed state
- Labelled with: reactor type, volume (m³), conversion
- Verified badge shown below schematic: green ✓ if `ok`, amber ⚠ if checks fail

### Tier 3 — Light animation (nice-to-have for V1)

- PFR: 4 particles animating left-to-right on a 2s loop
- CSTR: stirrer rotation (1s loop)
- These are illustrative — they are drawings, not simulations. Must not be mistaken for physics.

### Layout rule

The visualisation panel is the **centrepiece**. It takes 65% of the horizontal space on desktop. Chat is in the right 35%. The user sees the reactor first.

---

## 7. UI / UX Requirements

### 7.1 Layout

```
┌────────────────────────────────┬───────────────────┐
│  REACTOR CONFIGURATION (65%)   │  CONVERSATION(35%)│
│                                │                   │
│  [Schematic]                   │  [Chat history]   │
│                                │                   │
│  [Conversion vs Volume plot]   │  [Input box]      │
│                                │                   │
│  [Verified badge]              │                   │
└────────────────────────────────┴───────────────────┘
```

### 7.2 States

| State | Schematic panel | Chat panel |
|-------|----------------|------------|
| Initial (no session) | Dashed placeholder with prompt text | "Ask me to size a PFR or CSTR…" |
| Loading | Unchanged (previous result stays) | Animated typing indicator (3 dots) |
| Result | Schematic + plot + badge | Agent explanation with LaTeX |
| Error | Unchanged | Error message in agent bubble |

### 7.3 Input

- Textarea (auto-resize up to 200px height)
- Submit on Enter; Shift+Enter for newline
- Disabled while loading

### 7.4 Agent messages

- Rendered as Markdown (via `react-markdown`)
- LaTeX rendered via KaTeX (`remark-math` + `rehype-katex`)

### 7.5 Responsive

- Desktop: side-by-side 65/35 layout
- Mobile: single column, viz on top, chat below

---

## 8. API Contract

### POST `/api/chat`

**Request:**
```json
{
  "sessionId": "string",
  "message": "string"
}
```

**Response:**
```json
{
  "history": [
    { "id": "string", "role": "user|model", "content": "string" }
  ],
  "reactorState": {
    "type": "CSTR | PFR",
    "volume": 0.0,
    "conversion": 0.0,
    "profile": [{ "volume": 0.0, "conversion": 0.0 }],
    "checks": {
      "validConversion": true,
      "positiveVolume": true
    },
    "ok": true
  }
}
```

- `reactorState` is `null` if no solver has been called yet.
- `profile` is only present for PFR results; omitted for CSTR.
- History contains only text turns (tool call/response turns are filtered out before sending to client).

---

## 9. Team Responsibilities

| Area | Owner |
|------|-------|
| Solver math & verification logic (`size_cstr`, `size_pfr`, `conversion_in_cstr`, `conversion_in_pfr`) | Teammate |
| Tool interface contract (`types.ts`, API response shape) | Shared — both must agree on changes |
| Agent (system prompt, tool routing, session handling) | User (Michael) |
| UI layout, schematic, plot, verified badge | User (Michael) |
| Server setup, Vite/Express integration | User (Michael) |
| Deployment | TBD |

---

## 10. Out of Scope for V1

- Reactor series / networks
- Energy balances / non-isothermal
- Pressure drop
- Multiple reactions
- Optimisation (temperature, residence time)
- External simulators (DWSIM, Aspen, MATLAB)
- 3D model assets (deferred to V2+)
- User accounts / persistent sessions (in-memory only for V1)
- On-the-fly tool creation

---

## 11. Roadmap (Post V1)

| Version | Theme |
|---------|-------|
| v2 | Optimisation engine — temperature, residence time, sizing |
| v3 | AI explanation layer — natural language, step-by-step interpretation |
| v4 | DWSIM integration — automated flowsheets, thermodynamics |
| v5 | Advanced features — multi-reactor, recycle, separation, heat |
| v6 | Aspen integration — industrial-grade simulation |
| v7 | MATLAB + advanced AI — dynamic simulation, RL optimisation |

### Platform direction — toward a desktop app

V1 ships as a web app, but the long-term target is a **desktop application** (e.g. Electron/Tauri). The visualisation is the centrepiece, and desktop unlocks **real, performant 3D** — GPU-accelerated, a larger viewport, and locally-bundled assets — where **transparent 3D reactors showing the flow inside become extremely effective**, and far smoother than in the browser. The current SVG schematics (now driven by the live numbers — gradient/fill track real conversion, flow speed ≈ residence time) are the 2D foundation and fallback; the high-quality 3D reactor library (Sketchfab/Meshy/CGTrader, decimated + Draco-compressed, per the deck) lands once we're on desktop. **Design implication:** keep the viz layer cleanly swappable so a 3D renderer can drop in behind the same interface.

---

## 12. Definition of Done (V1)

V1 is complete when:
- [x] All 4 solver tools are implemented and verified — `npm run test:solvers` passes (unit test suite still TODO; smoke test only)
- [x] Agent correctly routes all 4 tool types from natural language (size_pfr, size_cstr, conversion_in_pfr, conversion_in_cstr all verified live)
- [x] Agent asks for missing parameters rather than guessing (verified: asks for F_A0/C_A0/k)
- [x] Verification badge shows correct state for all solver outputs
- [x] Conversion vs volume plot renders accurately for both reactor types
- [x] CSTR and PFR schematics render with correct labels
- [x] Layout is responsive (desktop + mobile tab switch)
- [x] A student can go from "size a PFR to 90% conversion" to seeing the answer, plot, and schematic without any engineering background

**Remaining for a polished V1:**
- [ ] Proper solver unit tests (edge cases, n-th order) — owner: teammate
- [ ] Loading/error UX when the model is overloaded (currently a generic message)
- [ ] Decide on deployment / hosting (PRD §9 lists this as TBD)
- [ ] Optional engineering-credibility additions: show assumptions (isothermal, 1st order), residence time τ, and the design equation used

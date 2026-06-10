# Contributing

## Roles

| Person | Responsibility | Files owned |
|--------|---------------|-------------|
| **Person A** | Solvers — mathematical engine the AI calls | `src/solvers/**` |
| **Person B** | Architecture & AI — server, Gemini tooling, frontend | `server.ts`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `vite.config.ts`, `tsconfig.json`, `package.json`, `index.html` |
| **Both** | Shared types contract | `src/solvers/types.ts`, `src/types.ts` — discuss before changing |

**Rule:** Do not edit files outside your owned area without first opening a discussion on the PR.

## Branching

```
main                   ← stable, no direct pushes
feature/solvers        ← Person A's branch
feature/ai-arch        ← Person B's branch
```

- Always branch off the latest `main`.
- Name branches: `feature/<short-description>` or `fix/<short-description>`.
- Open a Pull Request to merge into `main`. The other person reviews before merging.

## Solver contract (Person B reads this)

Person A exports the following from `src/solvers/index.ts`:

```ts
sizeCSTR(input: SizingInput): SizingResult
conversionInCSTR(input: ConversionInput): ConversionResult
sizePFR(input: SizingInput): SizingResult
conversionInPFR(input: ConversionInput): ConversionResult
```

**Input types:**

```ts
SizingInput    = { F_A0, C_A0, k, X_target, order? }
ConversionInput = { F_A0, C_A0, k, V, order? }
```

**Result types:**

```ts
SizingResult    = { ok, validConversion, positiveVolume, V, profile?, error? }
ConversionResult = { ok, validConversion, positiveVolume, X, profile?, error? }
```

All units are SI: `mol/s`, `mol/m³`, `1/s` (first-order), `m³`.

## Commit style

```
feat: add n-th order CSTR solver
fix: handle X=0 edge case in PFR integrator
refactor: extract Levenspiel integrand helper
```

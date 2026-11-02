# Relay

**An AI support agent that takes real actions through tools, pauses for a human on big refunds,
shows every step it takes, and is graded by an automated eval suite.**

Relay works the support desk of Northwind Outfitters, a fictional outdoor-gear store. You chat as
the customer; the agent looks up accounts and orders, tracks parcels, reads policy, issues refunds,
changes addresses and escalates to humans, using Gemini function calling.

## What it shows
- **Agent loop with parallel tool calls:** model → tools → model, until it replies, needs a human
  or hits a step limit (8). The model often batches lookups, e.g. customer + order + policy in one step.
- **Live trace:** every model decision and tool call with arguments, results, timing and token use,
  streamed as newline-delimited JSON while the agent works.
- **Human in the loop:** refunds over $100 pause the turn. A supervisor approves or declines, and
  the agent resumes exactly where it stopped (the paused call plus any later calls from the same step).
- **Guardrails in code, not just the prompt:** tools verify the customer owns the order, enforce the
  30-day window, cap refunds at what's left on the order and require approval above $100. In testing,
  a prompt injection got the model to *attempt* a $500 refund; the tool refused it.
- **Evals:** 13 scenarios (happy paths, policy limits, approvals, safety) run against each model and
  graded by deterministic code checks on what the agent did and said. Results are on the Evals page.

## Eval results
RESULTS_TABLE

## How it works
| Piece | Where |
|---|---|
| Store data, policy and helpers | `src/agent/store.ts` |
| Tool schemas and implementations, with hard limits | `src/agent/tools.ts` |
| Agent loop, approvals, retries and model fallback | `src/agent/loop.ts` |
| Eval scenarios and checks | `src/agent/scenarios.ts` |
| Eval runner (writes `public/evals.json`) | `scripts/eval.ts` |
| Streaming endpoint, validation, rate limits | `src/server/handler.ts`, `api/agent.ts` |
| Chat, live trace, store view, evals page | `src/components/` |

The server is stateless. The browser keeps the conversation and its own sandbox copy of the store
and sends both with each turn. The history is replayed to Gemini verbatim, because Gemini 3 needs
its thought signatures back to continue a tool-calling turn.

## Run locally
```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev                  # http://127.0.0.1:5193
npm run eval                 # runs all scenarios against both models, writes public/evals.json
```
The eval runner goes one scenario at a time and waits out rate limits, so it works on a free-tier key.

## Deploy
Import the repo into Vercel and set `GEMINI_API_KEY`. `GEMINI_MODEL` optionally overrides the
default `gemini-3.5-flash-lite` (backup: `gemini-3.8-flash`).

Stack: React 19, TypeScript, Vite, Gemini function calling (`@google/genai`), Vercel Functions.

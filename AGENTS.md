# AGENTS.md

## Project overview
KapMan Fair Value Tool is a containerized React + Vite application with an Express backend that:

- calculates modified-Graham intrinsic value estimates
- supports manual scorecard inputs persisted in browser localStorage
- refreshes market prices via a server-side Polygon proxy endpoint
- serves a production SPA from a single Node container

Use `README.md` and source code as the source of truth for current scope and acceptance criteria.

## How to work in this repository
- Work autonomously.
- Make the most conservative reasonable assumption when details are missing.
- Do not stop to ask clarifying questions unless repo files contain a true blocking contradiction.
- Do not defer in-scope work with placeholder TODOs.
- Prefer small, working vertical slices over broad incomplete scaffolding.
- Before editing, inspect existing files and follow established patterns.
- After each meaningful change, run the narrowest relevant validation step.

## Git and GitHub workflow (simplified protocol — direct-to-main)

Work directly on `main`. No feature branches, no pull requests, no review
ceremony. Execute all steps autonomously.

- **Every change starts with a GitHub issue** containing the story: what is
  changing, why, and how it will be validated. Use `gh issue create` before
  writing code.
- Reference the issue in the commit body (`Refs #N` or `closes #N`). Small
  atomic commits; one story may span several commits.
- **Run the full validation suite before committing** (see Testing and
  validation below). Fix failures yourself — do not proceed with a broken
  build or report failures to the human and ask what to do.
- **After validation passes, sync immediately**: push to `origin/main` so
  GitHub never trails tested local work. Never push known-broken code; never
  force-push `main`.
- Close the issue with a short summary comment: what shipped, what validation
  ran (build / smoke / deploy verify), and any follow-ups.

### Definition of done — automated checklist

Work on an issue is NOT complete unless ALL of the following are confirmed
by you, not reported to the human for confirmation:

- [ ] GitHub issue exists and is referenced by the commit(s)
- [ ] `npm run build` exits 0
- [ ] App serves SPA at `http://localhost:8080`
- [ ] `/api/prices` and `/api/quotes` respond to valid POST requests
- [ ] Smoke test curl commands return expected output
- [ ] Work is pushed to `origin/main`
- [ ] GitHub issue is closed with a summary comment

Only after all checklist items are confirmed should you report completion to the human.

Do not push directly to `main` unless the user explicitly requests
direct-to-main delivery.

## Tech stack (current)
- React 18 (frontend)
- Vite 6 (build/dev server)
- Express 4 (backend API + static serving)
- Tailwind CSS 3
- Fly.io deployment via Docker

Do not swap frameworks or major packages unless explicitly required by repo requirements.

## Repository layout
- `/src/App.jsx` — main UI logic and intrinsic value workflow
- `/src/main.jsx` — React entrypoint
- `/src/index.css` — Tailwind and global styles
- `/server/index.js` — Express server and Polygon proxy API
- `/Dockerfile` — container build
- `/fly.toml` — Fly deployment config

New files should follow this layout:

| Type | Location |
|---|---|
| New UI components | `src/components/` |
| New React hooks | `src/hooks/` |
| Client utilities | `src/lib/` |
| Server/API utilities | `server/lib/` |
| Server routes | `server/routes/` |

## Environment requirements
Required environment variables:
- `PORT` (optional in local; defaults to `8080`)
- `FINNHUB_API_KEY` (primary fundamentals source for `/api/quotes`; free tier,
  60 calls/min, shared with kapman-finnhub-mcp-server; `FINHUB_API_KEY`
  accepted as fallback spelling. Without it, `/api/quotes` degrades to
  Yahoo-only — functional but fragile.)

Rules:
- Never hardcode secrets.
- Keep `.env` out of version control.
- If adding environment variables, document them in `README.md`.

## Setup and run
Primary local workflow:
1. `npm install`
2. `npm run dev`
3. Verify client at `http://localhost:5173`
4. Verify API via Vite proxy at `/api/prices`

Production workflow:
1. `npm run build`
2. `npm run start`
3. Verify app at `http://localhost:8080`

## Architecture boundaries
- Frontend remains in `src/` and backend remains in `server/`.
- All third-party market data calls must go through backend API routes.
- Do not call Polygon directly from browser code.
- Keep UI rendering, value-calculation logic, and network access concerns separate.
- Preserve SPA fallback behavior for non-`/api/*` routes.

## Coding conventions
- Use named exports for shared modules.
- Keep default exports only where framework conventions naturally use them.
- Keep files focused and reasonably small.
- Prefer explicit, readable code over clever abstraction.
- Avoid speculative generalization.
- Do not add dependencies unless required by the task.
- Never log secrets or API keys.

## API contract rules
- Validate request payloads for all API endpoints.
- Return explicit HTTP status codes for invalid input and server misconfiguration.
- Error responses should be JSON with a clear `error` field.
- Do not silently swallow contract-breaking input.

## UI rules
Every data-dependent view should handle:
- loading
- empty or unavailable data
- populated state

Additional requirements:
- Show actionable error messages for failed refreshes.
- Do not block manual editing when live price refresh fails.
- Keep tables and numeric fields legible on desktop and mobile widths.

## Testing and validation
Before marking any work complete, run all of the following yourself and
fix failures before proceeding:

```bash
npm run build
```

Then validate app behavior with runtime smoke tests:

```bash
npm run start
curl -sf http://localhost:8080/ | grep -i "<html"
curl -sf -X POST http://localhost:8080/api/prices -H "content-type: application/json" -d '{"tickers":["AAPL"]}'
```

If the repository later adds lint, typecheck, or unit tests, include them in the required validation sequence.

## Definition of done
Work is not complete unless all of the following are true and confirmed by you:

- Build succeeds (`npm run build`)
- App is reachable at `http://localhost:8080`
- Core API route `/api/prices` responds correctly
- No runtime errors introduced in UI flow
- GitHub issue is open, linked to the PR, and closed on completion
- PR auto-merge is enabled and confirmed via `gh pr view --json autoMergeRequest`
- Local checkout is restored to `main` and clean

## Off-limits
- No exposing secrets in code, logs, screenshots, or issue comments
- No browser-direct market-data calls (Finnhub and Yahoo stay server-side)
- No silent failures for malformed API inputs
- No leaving work half-complete with TODO deferrals for in-scope requirements
- No instructing the human to run tests, merge PRs, or close issues manually when automation is possible

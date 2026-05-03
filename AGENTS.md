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

## Git and GitHub workflow — FULLY AUTONOMOUS

For every fix or feature, execute ALL of the following steps without stopping
for human input. Do not report steps as "manual" unless a true permission
blocker prevents execution.

### Step 1 — Create a GitHub issue before writing any code

```bash
gh issue create --title "<short title>" --body "<acceptance criteria>"
```

Note the issue number returned. All subsequent commits and the PR must
reference this issue number.

### Step 2 — Create a feature branch named after the issue

```bash
git checkout -b fix/KM-NNN-short-description
```

### Step 3 — Implement, then commit with issue reference in every commit message

```bash
git commit -m "fix: <description> (closes #NNN)"
```

### Step 4 — Run the full validation suite yourself — do not skip any step

```bash
npm run build
npm run start -- --help >/dev/null 2>&1 || true
```

Then run local smoke checks against a running server:

```bash
curl -sf http://localhost:8080/ | grep -i "<html"
curl -sf -X POST http://localhost:8080/api/prices \
  -H "content-type: application/json" \
  -d '{"tickers":["AAPL"]}'
```

If any command exits non-zero, fix all failures before proceeding.
Do not proceed with a broken build. Do not report failures to the human
and ask what to do — fix them.

### Step 5 — Push the branch

```bash
git push -u origin fix/KM-NNN-short-description
```

### Step 6 — Open a PR and enable auto-merge in a single pipeline

```bash
gh pr create --title "<title>" --body "Closes #NNN" --base main
gh pr merge --auto --squash
```

Both commands must succeed before continuing.

### Step 7 — Verify auto-merge was accepted

```bash
gh pr view --json autoMergeRequest
```

If `autoMergeRequest` is null, report the exact blocker and the exact
`gh` command the human must run to unblock it. Do not say "please merge
manually" without providing the specific unblocking command.

### Step 8 — Run smoke tests yourself using curl

After local startup succeeds, execute these yourself — do not give
the human commands to run:

```bash
curl -sf http://localhost:8080/ | grep -i "<html"
curl -sf -X POST http://localhost:8080/api/prices \
  -H "content-type: application/json" \
  -d '{"tickers":["AAPL","MSFT"]}'
```

If either fails, fix the failure before marking the issue closed.

### Step 9 — Close the GitHub issue with PR reference

```bash
gh issue close NNN --comment "Resolved in PR #<pr-number>"
```

### Step 10 — Clean up the local checkout after merge

After the PR is merged or auto-merge completes, return the local workspace to
`main` before reporting completion:

```bash
git switch main
git pull --ff-only origin main
git status -sb
```

The final status must show `main` tracking `origin/main` with no uncommitted
changes. Do not leave the local checkout on a closed PR branch.

### Definition of done — automated checklist

Work on an issue is NOT complete unless ALL of the following are confirmed
by you, not reported to the human for confirmation:

- [ ] GitHub issue exists and is linked to the PR
- [ ] `npm run build` exits 0
- [ ] App serves SPA at `http://localhost:8080`
- [ ] `/api/prices` responds to valid POST requests
- [ ] PR is open and auto-merge is enabled (verified via `gh pr view --json autoMergeRequest`)
- [ ] Smoke test curl commands return expected output
- [ ] GitHub issue is closed with PR reference
- [ ] Local checkout is back on `main`, fast-forwarded from `origin/main`, with a clean `git status -sb`

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
- `POLYGON_API_KEY` (required for live price refresh)

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
- No direct-to-`main` pushes unless explicitly requested
- No exposing secrets in code, logs, screenshots, or issue comments
- No browser-direct Polygon calls
- No silent failures for malformed API inputs
- No leaving work half-complete with TODO deferrals for in-scope requirements
- No instructing the human to run tests, merge PRs, or close issues manually when automation is possible

# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Build & Dev Commands

- `npm install` — install dependencies
- `npm run dev` — start Vite dev server with HMR
- `npm run build` — type-check with `tsc` then bundle with Vite
- `npm run preview` — serve the production build locally

There is no test runner, linter, or formatter configured in this project.

## Architecture

This is a single-page React + TypeScript app (Vite-based) that generates a recruiter-ready portfolio from a GitHub username using only the **public GitHub REST API** (no auth token).

### Single-file application

The entire application lives in `src/App.tsx` (~1300 lines). There are no separate component files, hooks, or service modules. All types, utility functions, API helpers, and the main `App` component are co-located in this one file.

### Key sections within `src/App.tsx`

- **Types** (lines 7–51): `Profile`, `Repo`, `Portfolio`, `KnowledgeBase` — map directly to GitHub API responses and internal state.
- **`RateLimitError` class** (lines 53–60): Custom error thrown when GitHub returns a 403 with `x-ratelimit-remaining: 0`.
- **API helpers** — `fetchGitHubJson` and `fetchGitHubText` wrap `fetch` with rate-limit detection and optional 404 tolerance (`allowNotFound`).
- **`buildSummary`** (line 87): Generates an "AI Summary" (actually deterministic heuristics, not a real LLM) from profile + repo metadata.
- **`buildKnowledgeBase`** (line 180): Fetches README content for every repo (or top-10 when deep scan is off) and extracts keyword-based skills. This drives the recruiter bot.
- **`buildMockResponse`** (line 227): The recruiter bot chat uses keyword matching against the knowledge base — there is no real AI backend.
- **Export functions** — `downloadImage` (html2canvas → PNG), `downloadPdf` (html2canvas → jsPDF), `downloadZip` (builds a self-contained HTML page with inline CSS/JS and bundles it via JSZip).
- **`App` component** (line 353): All UI state is managed with `useState`/`useRef` hooks — no external state management library.

### Layout behavior

The grid layout changes based on whether the user has a GitHub profile README (`username/username` repo). When a README exists (`hasReadme === true`), the About section renders in the left column and repos move to the right column. Without a README, everything stacks in the left column with a contribution graph placeholder.

### Styling

`src/style.css` is a single CSS file using CSS custom properties (declared in `:root`). Dark theme only. Fonts are loaded from Google Fonts (Space Grotesk + DM Mono). A `.pdf-export` body class is toggled during PDF generation to adjust rendering.

### Rate limiting

The app polls `api.github.com/rate_limit` every 60 seconds and displays remaining requests. When limits are hit, the submit button is disabled and shows a countdown. The recruiter bot also auto-disables when remaining requests drop below 10.

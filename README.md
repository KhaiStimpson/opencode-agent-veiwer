# OpenCode Agent Viewer

![Proudly Vibe Coded - Midnight Glow](https://vibecoded.fyi/badges/flat/main/proudly-vibe-coded-midnight-glow.svg)

Read-only web UI for monitoring OpenCode sessions and subagents in real time.

It connects directly from the browser to one or more running OpenCode servers using `@opencode-ai/sdk`, shows the session tree for the selected server in a sidebar, and renders messages, todos, token usage, cost, and premium-request estimates in the main panel.

## Features

- **Multi-server support** — save multiple OpenCode server URLs and switch between them instantly; each has its own connection status dot (green/yellow/red/grey)
- Live session tree with parent/child subagent nesting for the active server
- Message stream viewer with auto-scroll to the latest output
- Polling fallback so active sessions still update if SSE is unreliable
- Todo tracking for the selected session
- Token and cost summary in the Info tab
- Premium request estimator with per-model breakdown and compaction counts
- Direct browser connection, no backend proxy
- **Aggregated dashboard** — cost, tokens, model usage, tool stats, and activity charts merged across **all** connected servers at once

## Tech Stack

- React 19
- Vite 8
- TypeScript
- Mantine 9
- `@mantine/charts` (built on `recharts`) — used for dashboard visualizations
- `recharts` — charting peer dependency
- `react-router` — simple route for `/dashboard`
- `@opencode-ai/sdk`
- `@phosphor-icons/react`

## Requirements

- Node.js 20+
- One or more running OpenCode servers with CORS enabled for the Vite dev origin

## Getting Started

Install dependencies:

```bash
npm install
```

### Option A — Auto-discover repos (recommended)

Point `serve-repos` at a base directory and it will find every opencode repo
inside it automatically — no need to list them one by one:

```bash
npm run serve-repos -- --scan ~/work
```

A directory is recognized as an opencode repo if it contains `.opencode/`,
`opencode.json`, or `.opencode.json`. Only direct children of the scan
directory are checked (depth 1).

The script assigns ports starting at `4096` (one per repo), prints the URLs to
add to the viewer, and shuts everything down cleanly when you press Ctrl+C.

You can also put the scan directory in an `opencode-repos.json` config file at
the root of this project and run the script without arguments:

```json
{
  "scanDir": "~/work"
}
```

```bash
npm run serve-repos
```

Mix auto-discovery with a hand-picked list if you need repos from multiple
places:

```json
{
  "scanDir": "~/work",
  "repos": ["/opt/special-project"]
}
```

Override the base port or viewer origin with environment variables:

```bash
SCAN_DIR=~/work BASE_PORT=5000 VIEWER_ORIGIN=http://localhost:3000 npm run serve-repos
```

### Option B — Specify repos explicitly

Pass individual repo paths as arguments:

```bash
npm run serve-repos -- ~/work/project-a ~/work/project-b ~/work/project-c
```

Or list them in `opencode-repos.json`:

```json
{
  "repos": [
    "~/work/project-a",
    "~/work/project-b",
    "~/work/project-c"
  ]
}
```

### Option C — Manual

Start each OpenCode server with CORS enabled (one per project folder you want to monitor):

```bash
# project 1
cd ~/work/project-a
opencode serve --cors http://localhost:5173

# project 2 (in another terminal, different port)
cd ~/work/project-b
opencode serve --port 4097 --cors http://localhost:5173
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`. The first saved server URL is `http://localhost:4096`.

### Adding more servers

1. Click the **+** button next to the server dropdown in the header.
2. Type the URL of the other OpenCode server (e.g. `http://localhost:4097`).
3. Click **Add** — the server is saved, set as active, and auto-connected.
4. Use the dropdown to switch between servers for the Sessions view.
5. Open the **Dashboard** view (Sessions/Dashboard toggle, top-right) to see aggregated stats across **all** connected servers simultaneously.

The server list is persisted to `localStorage` so it survives page reloads. The active server and connection states are restored automatically.

### Removing a server

When two or more servers are saved, a trash icon appears next to the dropdown. Click it to remove the currently selected server.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build for production
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run serve-repos -- <path> [path…]` - spawn `opencode serve` for one or more repo directories

## How It Works

- Each server entry stores its own `createOpencodeClient({ baseUrl })` instance
- Connection health is verified with `fetch(<baseUrl>/global/health)` before the SDK client is created
- The **Sessions view** operates on the currently selected (active) server:
  - `session.list()`, `session.status()`, `session.messages({ path: { id } })`, `session.todo({ path: { id } })`
  - Real-time updates via `event.subscribe()`
- The **Dashboard view** fetches sessions and messages from every connected server in parallel, then merges all the data into a single aggregated `DashboardStats` object

## Browser / SDK Notes

The OpenCode SDK currently bundles some Node-oriented dependencies like `cross-spawn`, `which`, and `isexe`. These are not used by this app in the browser, but Vite still needs browser-safe stubs for globals they reference during parsing.

`vite.config.ts` includes `define` shims for:

- `process.env`
- `process.platform`
- `process.cwd`
- `global`

Without these, the browser may fail with errors like `process is not defined` or `global is not defined`.

## Real-Time Updates

The viewer uses two mechanisms:

1. SSE via `client.event.subscribe()` for low-latency updates
2. Polling for the selected session every 2 seconds as a fallback

This means the message panel should continue updating even if SSE drops or the browser does not receive all stream events.

## Premium Request Estimator

The Info tab includes a premium-request section that estimates GitHub Copilot premium usage from the session history.

It shows:

- User prompt count
- Weighted request estimate by model multiplier
- Click-to-expand per-model breakdown
- Compaction count with auto/manual breakdown
- Combined estimate that includes compactions separately

### Counting model

The estimator is intentionally conservative and transparent:

- `user` messages are treated as prompts
- Model multipliers are based on GitHub Copilot billing docs
- Compactions are shown separately because GitHub docs say autonomous actions do not usually count as premium requests, but some users may still want visibility into them

This is an estimate only. OpenCode itself does not currently expose an authoritative GitHub billing counter through the SDK.

Reference:

- https://docs.github.com/en/copilot/concepts/billing/copilot-requests

## Current Limitations

- Read-only viewer; it cannot send prompts or control sessions
- Premium request counts are estimated, not guaranteed billing truth
- Unknown models fall back to a `1x` multiplier in the estimator
- Dashboard includes client-side charts (recharts) which increase the bundle size; you may see a chunk-size warning during build

## Project Structure

```text
src/
  components/
    ConnectionHeader.tsx
    Dashboard.tsx
    EmptyState.tsx
    MessageItem.tsx
    MessageList.tsx
    SessionDetail.tsx
    SessionNav.tsx
    SessionNavItem.tsx
    StatCard.tsx
    StatusBadge.tsx
    TodoList.tsx
    TokenSummary.tsx
    ToolCallPart.tsx
  hooks/
    useEvents.ts
    useMultiServerDashboard.ts   ← aggregates stats across all connected servers
    useOpencode.tsx              ← manages the list of server connections
    useProviders.ts
    useSessionDetail.ts
    useSessions.ts
    useDashboard.ts
  lib/
    opencode.ts
    pricing.ts
  types/
    index.ts
  App.tsx
  index.css
  main.tsx
  theme.ts
```

## Troubleshooting

If the page is blank or gray:

- make sure at least one OpenCode server is running
- make sure it was started with `--cors http://localhost:5173`
- restart `npm run dev` after SDK or Vite config changes
- check the browser console for connection or SSE errors

If sessions appear but live updates stall:

- keep the target session selected so polling stays active
- check for `[SSE]` logs in the browser console
- verify the selected server URL matches the OpenCode server origin

If the Dashboard shows data for only some servers:

- check that each server's status dot in the dropdown is green (connected)
- servers that are disconnected or errored are skipped during dashboard aggregation
- click the **Refresh** button in the Dashboard toolbar to clear the message cache and re-fetch

## Status

The app builds successfully with:

```bash
npm run build
```


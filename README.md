# OpenCode Agent Viewer

![Proudly Vibe Coded - Midnight Glow](https://vibecoded.fyi/badges/flat/main/proudly-vibe-coded-midnight-glow.svg)

Read-only web UI for monitoring OpenCode sessions and subagents in real time.

It connects directly from the browser to a running OpenCode server with `@opencode-ai/sdk`, shows the session tree in a sidebar, and renders messages, todos, token usage, cost, and premium-request estimates in the main panel.

## Features

- Live session tree with parent/child subagent nesting
- Message stream viewer with auto-scroll to the latest output
- Polling fallback so active sessions still update if SSE is unreliable
- Todo tracking for the selected session
- Token and cost summary in the Info tab
- Premium request estimator with per-model breakdown and compaction counts
- Direct browser connection, no backend proxy

## Tech Stack

- React 19
- Vite 8
- TypeScript
- Mantine 9
- `@opencode-ai/sdk`
- `@phosphor-icons/react`

## Requirements

- Node.js 20+
- A running OpenCode server with CORS enabled for the Vite dev origin

## Getting Started

Install dependencies:

```bash
npm install
```

Start the OpenCode server with CORS enabled:

```bash
opencode serve --cors http://localhost:5173
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`, enter the OpenCode server URL if needed, and connect.

The default server URL in the app is `http://localhost:4096`.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build for production
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint

## How It Works

- The browser creates an SDK client with `createOpencodeClient({ baseUrl })`
- Connection health is checked with `fetch(<baseUrl>/global/health)`
- Session lists and details are loaded from the SDK:
  - `session.list()`
  - `session.status()`
  - `session.messages({ path: { id } })`
  - `session.todo({ path: { id } })`
- Real-time updates use `event.subscribe()`
- The selected session also refreshes on a short polling interval as a fallback

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
- The UI is optimized for local development against a local OpenCode server

## Project Structure

```text
src/
  components/
    ConnectionHeader.tsx
    EmptyState.tsx
    MessageItem.tsx
    MessageList.tsx
    SessionDetail.tsx
    SessionNav.tsx
    SessionNavItem.tsx
    StatusBadge.tsx
    TodoList.tsx
    TokenSummary.tsx
    ToolCallPart.tsx
  hooks/
    useEvents.ts
    useOpencode.tsx
    useSessionDetail.ts
    useSessions.ts
  lib/
    opencode.ts
  types/
    index.ts
  App.tsx
  index.css
  main.tsx
  theme.ts
```

## Troubleshooting

If the page is blank or gray:

- make sure the OpenCode server is running
- make sure it was started with `--cors http://localhost:5173`
- restart `npm run dev` after SDK or Vite config changes
- check the browser console for connection or SSE errors

If sessions appear but live updates stall:

- keep the target session selected so polling stays active
- check for `[SSE]` logs in the browser console
- verify the selected server URL matches the OpenCode server origin

## Status

The app builds successfully with:

```bash
npm run build
```

# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Project Overview

Read-only web UI for monitoring OpenCode agent sessions. Built with React 19,
Mantine 9, Vite 8, TypeScript 6, and `@opencode-ai/sdk`. Connects directly
from the browser to a running OpenCode server -- no backend proxy.

## Build / Lint / Dev Commands

```bash
npm run build        # tsc -b && vite build (type-check + production bundle)
npm run dev          # vite dev server on http://localhost:5173
npm run lint         # eslint .
npm run preview      # serve the production build locally
npx tsc --noEmit     # type-check only, no output
```

There is no test framework configured. No single-test command exists.

The OpenCode server must be started with CORS enabled for the dev origin:

```bash
opencode serve --cors http://localhost:5173
```

## TypeScript

- Target: ES2023, module: ESNext, bundler module resolution.
- `verbatimModuleSyntax: true` -- always use `import type { ... }` for
  type-only imports. The build will fail otherwise.
- `noUnusedLocals` and `noUnusedParameters` are enabled.
- `strict` is **not** enabled globally.
- `jsx: "react-jsx"` -- do not add `import React from "react"`.
- No path aliases. Use relative imports (`../hooks/useSessions`).

## Code Style

### Formatting

- 2-space indentation, no tabs.
- Semicolons always.
- Double quotes in all `src/` files.
- Trailing commas in multi-line constructs (objects, arrays, params, imports).

### Exports

- **Named exports only** in `src/`. Never use `export default`.

```ts
// correct
export function SessionNav({ tree }: SessionNavProps) { ... }

// wrong
export default function SessionNav(...) { ... }
```

### Function Style

- Use **function declarations** for components and hooks, not arrow functions.
- Arrow functions are fine for inline callbacks, `.map()`, `.filter()`,
  `useCallback` bodies, and effect cleanups.

```ts
// correct
export function useSessions(client: OpencodeClient | null) { ... }

// wrong
export const useSessions = (client: ...) => { ... };
```

### Naming

| Thing              | Convention           | Example                      |
|--------------------|----------------------|------------------------------|
| Components         | PascalCase           | `SessionNav`, `MessageItem`  |
| Component files    | PascalCase.tsx       | `SessionNav.tsx`             |
| Hooks              | camelCase, `use` pfx | `useSessions`                |
| Hook files         | camelCase.ts(x)      | `useSessions.ts`             |
| Types / Interfaces | PascalCase           | `SessionNode`, `TokenTotals` |
| Module constants   | UPPER_SNAKE_CASE     | `POLL_INTERVAL`              |
| Local variables    | camelCase            | `isConnected`, `statusMap`   |
| Handler props      | `on` prefix          | `onSelect`, `onConnect`      |
| Handler impl       | `handle` prefix      | `handleEvent`, `handleSubmit`|

### Types

- Use `interface` for object shapes (props, results, options, context values).
- Use `type` for unions, aliases, mapped types, and re-exports.
- Name props interfaces `{ComponentName}Props`. Do **not** export them.
- Name hook return interfaces `Use{HookName}Result`.
- Name hook option interfaces `Use{HookName}Options`.
- Declare interfaces directly above the function that uses them, in the
  same file, unless shared (then put in `types/index.ts`).

```ts
// private to this file
interface StatusBadgeProps {
  status: SessionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) { ... }
```

### Imports

Order imports in this sequence, separated by blank lines when logical:

1. CSS imports (Mantine styles, then local CSS) -- only in entry points
2. Mantine packages (`@mantine/core`, `@mantine/hooks`, etc.)
3. Third-party libraries (`@phosphor-icons/react`, `@opencode-ai/sdk`)
4. React (`react`, `react-dom`)
5. Local modules (relative paths)
6. Type-only imports (`import type { ... }`)

### Error Handling

- `async/await` everywhere. No `.then()` chains.
- Use `Promise.all` for parallel independent fetches.
- Silent `catch {}` (no error variable) for non-critical paths like
  `localStorage` access or optional API calls.
- `catch { return null; }` for API fetches where null means "no data".
- Use `err instanceof Error ? err.message : "fallback"` when surfacing.
- User-visible errors go through `notifications.show({ title, message, color })`.
- Console diagnostics use `console.log`/`console.warn` with `[SSE]` prefix.

### Component Structure

Follow this order inside every component file:

1. Imports
2. Props interface (unexported)
3. Helper types / functions (file-private)
4. Exported function component
   - Hooks at the top
   - Derived values
   - Handlers
   - Early returns for empty/null states
   - Return JSX

### Hooks

- Type `useState` generics explicitly when inference is insufficient:
  `useState<Session[]>([])`, `useState<string | null>(null)`.
- Always return a cleanup function from `useEffect` when setting up
  intervals, subscriptions, or async work.
- Use the `cancelled` flag pattern for async operations inside effects.
- Store mutable values that should not trigger re-renders in `useRef`.

### Styling

- Mantine components with `style` / `styles` props for one-off overrides.
- CSS variables: `var(--mantine-color-blue-6)`, etc.
- No CSS modules, no Tailwind, no styled-components.
- Icons from `@phosphor-icons/react` exclusively (not Tabler).

### Comments

- Sparse. Explain *why*, not *what*.
- `//` for single-line, `{/* */}` for JSX section labels.
- Use `/** JSDoc */` only for non-obvious utility functions.

## Vite Browser Shims

`vite.config.ts` defines shims for Node globals that the SDK's bundled
dependencies reference at parse time:

```ts
define: {
  "process.env": "{}",
  "process.platform": '"browser"',
  "process.cwd": '(() => "/")',
  "global": "globalThis",
}
```

Do not remove these -- the dev server will crash with
`process is not defined` or `global is not defined`.

## Key Architecture Notes

- Single React context (`OpencodeProvider`) holds the SDK client and
  connection state. All hooks receive the client from this context.
- Real-time updates use two mechanisms: SSE via `event.subscribe()` for
  low-latency, and polling intervals as a reliable fallback.
- Session tree supports arbitrary nesting depth via recursive `buildTree`
  and recursive `SessionNavItem` rendering.
- The `MessageWithParts` interface (`{ info: Message; parts: Part[] }`) is
  duplicated across several files. If adding a new consumer, define it
  locally in the file rather than importing from elsewhere (existing pattern).

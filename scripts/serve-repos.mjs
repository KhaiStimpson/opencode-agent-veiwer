#!/usr/bin/env node
/**
 * serve-repos.mjs
 *
 * Spawns `opencode serve` for one or more project directories so you don't
 * have to open a separate terminal per repo.
 *
 * Usage
 * -----
 *   # Pass paths directly:
 *   npm run serve-repos -- /path/to/repo-a /path/to/repo-b
 *
 *   # Or list them in opencode-repos.json (array of path strings):
 *   npm run serve-repos
 *
 * Each repo gets its own port starting at BASE_PORT (default 4096).
 * The viewer origin (--cors flag) defaults to http://localhost:5173.
 *
 * Override via environment variables:
 *   BASE_PORT=5000 VIEWER_ORIGIN=http://localhost:3000 npm run serve-repos -- /path/to/repo
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const BASE_PORT = parseInt(process.env.BASE_PORT ?? "4096", 10);
if (isNaN(BASE_PORT) || BASE_PORT < 1 || BASE_PORT > 65535) {
  console.error("[serve-repos] BASE_PORT must be a number between 1 and 65535.");
  process.exit(1);
}
const VIEWER_ORIGIN = process.env.VIEWER_ORIGIN ?? "http://localhost:5173";
const CONFIG_FILE = "opencode-repos.json";

// ── Resolve repo paths ────────────────────────────────────────────────────────

let repoPaths = process.argv.slice(2);

if (repoPaths.length === 0) {
  // Fall back to config file in the current working directory
  const configPath = resolve(process.cwd(), CONFIG_FILE);
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        repoPaths = parsed.map((p) => String(p));
      } else if (parsed.repos && Array.isArray(parsed.repos)) {
        repoPaths = parsed.repos.map((p) => String(p));
      }
    } catch (err) {
      console.error(`[serve-repos] Failed to parse ${CONFIG_FILE}:`, err.message);
      process.exit(1);
    }
  }
}

if (repoPaths.length === 0) {
  console.error(
    `[serve-repos] No repo paths provided.\n` +
      `  Pass paths as arguments:  npm run serve-repos -- /path/to/repo-a /path/to/repo-b\n` +
      `  Or create ${CONFIG_FILE} with an array of paths.`,
  );
  process.exit(1);
}

// ── Spawn one server per repo ─────────────────────────────────────────────────

const children = [];

for (let i = 0; i < repoPaths.length; i++) {
  const dir = resolve(repoPaths[i]);
  const port = BASE_PORT + i;
  const label = basename(dir);

  if (!existsSync(dir)) {
    console.warn(`[serve-repos] Directory not found, skipping: ${dir}`);
    continue;
  }

  console.log(`[serve-repos] Starting "${label}" on port ${port} — ${dir}`);

  const child = spawn(
    "opencode",
    ["serve", "--port", String(port), "--cors", VIEWER_ORIGIN],
    {
      cwd: dir,
      stdio: "inherit",
      env: { ...process.env },
    },
  );

  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error(
        `[serve-repos] "opencode" not found in PATH. ` +
          `Install it first: https://opencode.ai/docs`,
      );
    } else {
      console.error(`[serve-repos] Error spawning server for "${label}":`, err.message);
    }
    cleanup(1);
  });

  child.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && signal !== "SIGKILL") {
      console.warn(`[serve-repos] "${label}" exited (code=${code} signal=${signal})`);
    }
  });

  children.push({ child, label, port });
}

if (children.length === 0) {
  console.error("[serve-repos] No valid directories found. Exiting.");
  process.exit(1);
}

// ── Print connection summary ──────────────────────────────────────────────────

console.log("\n[serve-repos] Servers started. Add these URLs to the viewer:\n");
for (const { label, port } of children) {
  console.log(`  ${label.padEnd(30)} http://localhost:${port}`);
}
console.log(`\n  Viewer: ${VIEWER_ORIGIN}`);
console.log("\nPress Ctrl+C to stop all servers.\n");

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function cleanup(exitCode = 0) {
  console.log("\n[serve-repos] Stopping all servers…");
  for (const { child, label } of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      console.warn(`[serve-repos] Could not stop "${label}"`);
    }
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

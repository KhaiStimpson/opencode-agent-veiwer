#!/usr/bin/env node
/**
 * serve-repos.mjs
 *
 * Spawns `opencode serve` for one or more project directories so you don't
 * have to open a separate terminal per repo.
 *
 * Usage
 * -----
 *   # Auto-discover all opencode repos under a base directory:
 *   npm run serve-repos -- --scan ~/work
 *
 *   # Pass specific paths directly:
 *   npm run serve-repos -- /path/to/repo-a /path/to/repo-b
 *
 *   # Or configure in opencode-repos.json:
 *   {
 *     "scanDir": "~/work",          ← scan a base directory automatically
 *     "repos": ["/extra/repo"]      ← also include specific paths
 *   }
 *   npm run serve-repos
 *
 * Auto-discovery
 * ──────────────
 * A directory is recognized as an opencode repo if it contains any of:
 *   .opencode/          (config directory)
 *   opencode.json       (config file)
 *   .opencode.json      (hidden config file)
 *
 * Only direct children of the scan directory are checked (depth 1).
 *
 * Each repo gets its own port starting at BASE_PORT (default 4096).
 * The viewer origin (--cors flag) defaults to http://localhost:5173.
 *
 * Override via environment variables:
 *   SCAN_DIR=~/work BASE_PORT=5000 VIEWER_ORIGIN=http://localhost:3000 npm run serve-repos
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { homedir } from "node:os";

const BASE_PORT = parseInt(process.env.BASE_PORT ?? "4096", 10);
if (isNaN(BASE_PORT) || BASE_PORT < 1 || BASE_PORT > 65535) {
  console.error("[serve-repos] BASE_PORT must be a number between 1 and 65535.");
  process.exit(1);
}
const VIEWER_ORIGIN = process.env.VIEWER_ORIGIN ?? "http://localhost:5173";
const CONFIG_FILE = "opencode-repos.json";

/** Expand a leading ~ to the user's home directory. */
function expandHome(p) {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** Opencode presence markers we look for in a candidate directory. */
const OPENCODE_MARKERS = [".opencode", "opencode.json", ".opencode.json"];

/** Return true if `dir` looks like an opencode project. */
function isOpencodeRepo(dir) {
  return OPENCODE_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/**
 * Walk one level of `baseDir` and return every immediate child directory
 * that contains an opencode config marker.
 */
function discoverRepos(baseDir) {
  const abs = resolve(expandHome(baseDir));
  if (!existsSync(abs)) {
    console.warn(`[serve-repos] Scan directory not found: ${abs}`);
    return [];
  }

  let entries;
  try {
    entries = readdirSync(abs);
  } catch (err) {
    console.error(`[serve-repos] Cannot read scan directory ${abs}:`, err.message);
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const full = join(abs, entry);
    try {
      if (statSync(full).isDirectory() && isOpencodeRepo(full)) {
        found.push(full);
      }
    } catch {
      // skip entries we can't stat
    }
  }
  return found;
}

// ── Resolve repo paths ────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

// Pull --scan <dir> from CLI args
let scanDir = process.env.SCAN_DIR ?? null;
const explicitPaths = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--scan" && rawArgs[i + 1]) {
    scanDir = rawArgs[++i];
  } else {
    explicitPaths.push(rawArgs[i]);
  }
}

let repoPaths = [...explicitPaths];

if (repoPaths.length === 0 && !scanDir) {
  // Fall back to config file in the current working directory
  const configPath = resolve(process.cwd(), CONFIG_FILE);
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        repoPaths = parsed.map((p) => String(p));
      } else {
        if (parsed.scanDir) scanDir = String(parsed.scanDir);
        if (parsed.repos && Array.isArray(parsed.repos)) {
          repoPaths = parsed.repos.map((p) => String(p));
        }
      }
    } catch (err) {
      console.error(`[serve-repos] Failed to parse ${CONFIG_FILE}:`, err.message);
      process.exit(1);
    }
  }
}

// Auto-discover repos from the scan directory and merge with explicit list
if (scanDir) {
  console.log(`[serve-repos] Scanning for opencode repos in: ${resolve(expandHome(scanDir))}`);
  const discovered = discoverRepos(scanDir);
  if (discovered.length === 0) {
    console.warn(
      `[serve-repos] No opencode repos found under ${scanDir}.\n` +
        `  A directory is recognized as an opencode repo if it contains\n` +
        `  .opencode/, opencode.json, or .opencode.json.`,
    );
  } else {
    console.log(`[serve-repos] Found ${discovered.length} repo(s) via scan.`);
  }
  // Merge discovered paths, deduplicating against explicit ones
  const seen = new Set(repoPaths.map((p) => resolve(expandHome(p))));
  for (const d of discovered) {
    if (!seen.has(d)) {
      repoPaths.push(d);
      seen.add(d);
    }
  }
}

if (repoPaths.length === 0) {
  console.error(
    `[serve-repos] No repo paths provided.\n` +
      `  Auto-discover:  npm run serve-repos -- --scan ~/work\n` +
      `  Explicit paths: npm run serve-repos -- /path/to/repo-a /path/to/repo-b\n` +
      `  Or create ${CONFIG_FILE} with a "scanDir" or "repos" key.`,
  );
  process.exit(1);
}

// ── Spawn one server per repo ─────────────────────────────────────────────────

const children = [];

for (let i = 0; i < repoPaths.length; i++) {
  const dir = resolve(expandHome(repoPaths[i]));
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

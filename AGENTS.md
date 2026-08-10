<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VersionControl.gr

Free interactive Git course — "Learn Git, using Git".
Fully static Next.js app (no backend): a real Git engine runs in the browser.

## Commands

- `pnpm dev` — dev server
- `pnpm test` — Vitest: engine, shell, validators + **every challenge solvable via its solution script**
- `pnpm build` — static export to `out/` (must stay `output: 'export'` compatible)
- `pnpm smoke` — real-browser E2E via puppeteer-core + Edge (needs `node scripts/serve-out.mjs` running; `BASE=` overrides target)
- `pnpm run deploy` — build + `wrangler deploy` (Cloudflare Workers static assets → versioncontrol.gr). NOTE: must be `pnpm run deploy`, plain `pnpm deploy` is a reserved pnpm command.

## Architecture

- `src/git/` — GitEngine: isomorphic-git on a memfs Volume. Gap commands implemented on primitives: reset/revert/restore/switch/cherry-pick/stash (`ops/`). Merge conflicts via `abortOnConflict:false` + our own MERGE_HEAD state. `state.ts#buildRepoState` is THE snapshot read after every command (feeds graph, panels, validators).
- `src/terminal/` — tokenizer (quotes, `>` redirection), CommandSpec parser, shell dispatch, xterm-agnostic readline (history/tab-complete), `commands/git/*` print **verbatim real-git English output**.
- `src/validators/` — pure predicates over RepoState; challenges pass on final state, never on exact commands.
- `src/challenges/` — 56 challenges in 9 sections; declarative `setup` steps run under a deterministic clock (stable hashes across resets); `solution` used only by the test harness.
- `src/lib/game-store.ts` — Zustand session store (engine/shell/snapshot/evaluation); `progress.ts` — persisted progress/achievements/settings.
- UI: retro CRT arcade design system in `globals.css` + `components/ui/pixel.tsx`. Fonts: Inter Variable (titles), IBM Plex Sans (body), JetBrains Mono (terminal).

## Gotchas

- **Racy index**: memfs same-size writes within 1 ms are invisible to `statusMatrix` stat-checking. `engine.writeFile` bumps a monotonic mtime — always create files through the engine, never raw fs writes.
- isomorphic-git cache object must be recreated together with a new Volume (see `reset` in game-store).
- **Do not swap `ops/stash.ts` for isomorphic-git's native `git.stash`**: it restores files with raw fs writes (racy index — a same-size restore goes invisible), stamps `new Date()` into its intermediate commit messages (setup stashes stop being reproducible), and takes no `cache`. Stash entries live in memory on the engine, like `reflog`.
- All `next/link` uses `prefetch={false}`: Next 16 segment-prefetch `.txt` URLs 404 on static hosting.
- HUD/label text uses CSS `text-transform: uppercase` — browser `innerText` assertions must match the UPPERCASE text.
- xterm/isomorphic-git/memfs stay behind `next/dynamic` `ssr:false` boundaries (`ChallengeClient`, `PlaygroundClient`).

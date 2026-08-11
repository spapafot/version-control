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
- `pnpm seo:check` — validates the built `out/` (canonicals, one h1 per page, og:image, JSON-LD parses, sitemap covers every indexable page, **body text is not empty**). Run after `pnpm build`.
- `pnpm seo:keywords` — regenerates `docs/seo/keyword-map.md` from `src/challenges/seo.ts` + `src/lib/page-seo.ts`.

## Architecture

- `src/git/` — GitEngine: isomorphic-git on a memfs Volume. Gap commands implemented on primitives: reset/revert/restore/switch/cherry-pick/stash (`ops/`). Merge conflicts via `abortOnConflict:false` + our own MERGE_HEAD state. `state.ts#buildRepoState` is THE snapshot read after every command (feeds graph, panels, validators). `ops/remote.ts`: simulated origin — a second GitEngine at `/origin` on the SAME volume (`engine.remote`, attached by the `publish` setup step); fetch/push copy objects deflated between the two object stores (byte-identical ⇒ stable oids); pull = fetch + the normal merge machinery.
- `src/terminal/` — tokenizer (quotes, `>` redirection), CommandSpec parser, shell dispatch, xterm-agnostic readline (history/tab-complete), `commands/git/*` print **verbatim real-git English output**.
- `src/validators/` — pure predicates over RepoState; challenges pass on final state, never on exact commands.
- `src/challenges/` — 63 challenges in 10 sections; declarative `setup` steps run under a deterministic clock (stable hashes across resets); `solution` used only by the test harness.
- `src/lib/game-store.ts` — Zustand session store (engine/shell/snapshot/evaluation); `progress.ts` — persisted progress/achievements/settings.
- SEO: `src/lib/seo.ts` (`pageMetadata()` builds title/description/canonical/OG/Twitter — every page goes through it, so nothing drifts), `src/lib/schema.ts` (JSON-LD builders cross-referenced by `@id`), `src/lib/page-seo.ts` (top-level page copy), `src/challenges/seo.ts` (per-mission keyword titles, **parallel to** the in-game titles, which stay as they are). `src/app/opengraph-image.tsx` generates the 1200x630 card at build; it needs `dynamic = "force-static"` like the other metadata routes.
- UI: retro CRT arcade design system in `globals.css` + `components/ui/pixel.tsx`. Fonts: Inter Variable (titles), IBM Plex Sans (body), JetBrains Mono (terminal).

## Gotchas

- **`ssr:false` routes must keep a server-rendered counterpart.** `/challenge/*` and `/playground/` load their screens via `next/dynamic` `ssr:false`, so on their own they prerender an empty `<body>` and are unrankable. `MissionBrief` (challenge) and the About section (playground) are server components rendered as siblings of the client boundary to supply real HTML; they own the page's single `<h1>`, which is why `MissionPanel` renders an `<h2>`. `pnpm seo:check` fails if any page's body text drops below 250 chars, so do not "fix" that by deleting the section.
- **A page that exports its own `openGraph` stops inheriting the file-convention OG image.** Next silently drops it, which left 68 of 69 pages with no card. `pageMetadata()` sets `images: [OG_IMAGE]` explicitly; any new page must go through it. The generated image lands in `out/` with no file extension, so `public/_headers` supplies its `Content-Type` (verified: `wrangler dev` serves it as `image/png`).
- **Racy index**: memfs same-size writes within 1 ms are invisible to `statusMatrix` stat-checking. `engine.writeFile` bumps a monotonic mtime — always create files through the engine, never raw fs writes. This applies to `/origin` too: never raw-fs-write into the origin repo.
- **Simulated origin invariants**: the origin engine gets its OWN `cache` object (never share caches across repos) but shares the FsProvider/volume. `onRemote` setup steps share the main setup's clock closure — never give origin its own counter, or reset determinism breaks. Origin is logically bare after setup: learner pushes move `refs/heads/*` only, its worktree/index go stale by design, and nothing may read them post-setup. `buildRepoState` walks TRACKING oids only, never origin's actual tips (their objects may not exist locally before a fetch).
- isomorphic-git cache object must be recreated together with a new Volume (see `reset` in game-store).
- **Do not swap `ops/stash.ts` for isomorphic-git's native `git.stash`**: it restores files with raw fs writes (racy index — a same-size restore goes invisible), stamps `new Date()` into its intermediate commit messages (setup stashes stop being reproducible), and takes no `cache`. Stash entries live in memory on the engine, like `reflog`.
- All `next/link` uses `prefetch={false}`: Next 16 segment-prefetch `.txt` URLs 404 on static hosting.
- HUD/label text uses CSS `text-transform: uppercase` — browser `innerText` assertions must match the UPPERCASE text.
- xterm/isomorphic-git/memfs stay behind `next/dynamic` `ssr:false` boundaries (`ChallengeClient`, `PlaygroundClient`).

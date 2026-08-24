# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PZ Mod Extractor — an Astro + Cloudflare Workers app that turns one or more Steam Workshop collections/items (URL, ID, or a comma/newline-separated mix) into a ready-to-paste Project Zomboid mod list (`WorkshopItems=`, `Mods=`, `ModList=`). There's also a standalone Tampermonkey userscript that does the same extraction directly on Steam Workshop pages.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Package manager is pnpm (see `pnpm-lock.yaml` / `pnpm-workspace.yaml`).

## Commands

| Command | Action |
| --- | --- |
| `pnpm dev` | Start local dev server at `localhost:4321` |
| `pnpm build` | Build production site to `./dist/` |
| `pnpm preview` | Preview the build locally |
| `pnpm test` | Run the vitest suite once (`tests/**/*.test.ts`) |
| `pnpm test:watch` | Run vitest in watch mode |
| `pnpm generate-types` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` bindings via `wrangler types` |
| `pnpm astro check` | Type-check `.astro`/`.tsx` files and the project |
| `pnpm deploy` | Build then `wrangler deploy --env production` |
| `pnpm astro -- --help` | Astro CLI help |

To run a single test file: `pnpm exec vitest run tests/modExtractor.test.ts`. There is no separate lint script configured. Playwright is available as a devDependency for ad hoc browser verification of UI changes (see "Browser verification" below) — it isn't wired up as a test runner.

### Test suite

`tests/` uses vitest (`vitest.config.ts`, node environment):

- `convert.test.ts` — the `/api/convert` route handler and `src/lib/server/steamApi.ts` (ID/URL parsing, regex extraction).
- `modExtractor.test.ts` — pure logic in `src/lib/bbcode.ts`, `src/lib/modLogic.ts`, and `src/lib/exportImport.ts` (BBCode rendering/XSS sanitization, input classification, import/export payload validation).
- `userscript-parity.test.ts` — reads both `src/lib/server/steamApi.ts` and `userscripts/pz-collection-to-modstring.user.js` as text and asserts their `WORKSHOP_ID_PATTERN`/`MOD_ID_PATTERN` regex sources are identical, to catch silent drift between the two independent implementations (see Architecture below). If you change one pattern, change the other or this test fails.

### Browser verification

Playwright (`playwright` devDependency) drives a real headless Chromium against the dev server so UI changes can be checked visually instead of just type-checked. The browser binary is cached at `~/.cache/ms-playwright` (installed via `npx playwright install chromium`; re-run that if it's missing on a fresh machine/container).

With the dev server running (`astro dev --background`), drive it directly with Node — there's no project script for this, just `require('playwright')` in a throwaway script or inline `node -e`:

```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:4321');
  await page.waitForSelector('#collection-input', { timeout: 10000 });
  await page.screenshot({ path: '/tmp/landing.png' });
  await browser.close();
})();
```

Use `page.setViewportSize(...)` to check the `md:` breakpoint behavior (see Styling below), and `page.click`/`page.fill` to drive the flow (input submit, filters, drag-and-drop reorder) before screenshotting.

## Architecture

The app is deployed as a Cloudflare Worker via `@astrojs/cloudflare` (see `astro.config.mjs`, `wrangler.jsonc`). `wrangler.jsonc` points `main` at the Cloudflare adapter's server entrypoint and serves the Astro build output (`./dist`) as static assets. Regenerate `worker-configuration.d.ts` with `pnpm generate-types` after changing bindings in `wrangler.jsonc`.

Two independent implementations share the same conversion logic and constants (Steam API endpoints, `Workshop ?ID:` / `Mod ?ID:` regex patterns) — keep them in sync when changing extraction behavior, and see `tests/userscript-parity.test.ts`, which fails automatically if the regexes diverge:

- **Web app** — `src/pages/api/convert.ts` (server) + `src/lib/server/steamApi.ts` (shared extraction logic, ID/URL parsing) + the Preact client under `src/components/`, `src/hooks/`, `src/lib/`
- **Userscript** — `userscripts/pz-collection-to-modstring.user.js`, a self-contained Tampermonkey script for use directly on `steamcommunity.com` (uses `GM_xmlhttpRequest` instead of `fetch`)

### Web app data flow

The client is a Preact app (`@astrojs/preact`), not vanilla DOM manipulation — logic and rendering are deliberately decoupled:

1. `src/pages/index.astro` mounts `<ModExtractorApp client:load />` (`src/components/ModExtractorApp.tsx`).
2. `useModExtractor` (`src/hooks/useModExtractor.ts`) is the app's single state owner: a `useReducer` over `AppState` (`src/lib/types.ts`) with a big discriminated-union `Action` type. All state transitions live in the `reducer`/helper functions in this file — components only ever call the `actions` object it returns, they never dispatch directly.
3. `useSteamFetch` (`src/hooks/useSteamFetch.ts`) owns network calls: `submit()` classifies the raw textarea input via `classifyInput` (`src/lib/modLogic.ts`) into collection tokens vs. bare item tokens vs. unrecognized leftovers, fetches each in parallel via `Promise.allSettled`, and dispatches `SUBMIT_RESULT` for the reducer to fold into `state.sources`. `addToCustom()` fetches a single adhoc item into the persistent "Custom" source.
4. `useExportImport` (`src/hooks/useExportImport.ts`) handles JSON export/import of the whole modlist (sources + curated list + format flag) via `src/lib/exportImport.ts`, which versions the payload (`EXPORT_SCHEMA_VERSION`) and runtime-validates an imported file before dispatching `IMPORT_PAYLOAD`.
5. Both hooks POST to `POST /api/convert` (`src/pages/api/convert.ts`, `export const prerender = false`) via `fetchSourceFromApi` (`src/lib/steamClient.ts`). The API route resolves a collection ID (`extractCollectionId`), calls `resolveCollection` in `src/lib/server/steamApi.ts`, which hits the Steam Web API (`ISteamRemoteStorage/GetCollectionDetails` then `GetPublishedFileDetails`, chunked 50 at a time) and extracts `Workshop ID:` / `Mod ID:` values from each item's BBCode description via regex.
6. Rendering is a tree of presentational components (`ResultsScreen` → `FilterBar` + `SourcePanel` → `ModRow` + `BBCodeDescription`, and `CuratedList` → `CuratedRow`, plus `OutputRow`, `ExportImportControls`, `Toast`) that all take `state`/`actions` (or narrower slices) as props — see `ModExtractorApp.tsx` for the top of the tree.

**Multi-source model**: `state.sources` is an array of `Source` (`src/lib/types.ts`), not a single result set. Each submitted collection link gets its own `Source` panel (`kind: 'collection'`); bare item IDs/links merge into one persistent `kind: 'custom'` source (`ensureCustomSource`/`makeCustomSource` in `modLogic.ts`). The right-hand "Mod ID List" (`state.curated`, a flat ordered `CuratedItem[]`) is the actual thing that gets rendered into `WorkshopItems=`/`Mods=`/`ModList=` — it's built by merging entries in from any source via `mergeCurated`, and a curated entry tracks which source label(s) contributed it so `CLEAR_SOURCE` can untag/remove correctly without clobbering an entry another source also added.

Notable details worth knowing before touching this code:
- A mod can declare multiple Mod IDs in one description (e.g. optional variants); the UI lets the user check specific IDs to add (`TOGGLE_CANDIDATE`/`checkedNames`) rather than forcing a single pick, and `looksExclusive` (a heuristic regex, `EXCLUSIVE_HINT_PATTERN` in `src/lib/bbcode.ts`) warns when the description's prose suggests the IDs are mutually-exclusive branches.
- Workshop descriptions are BBCode, not HTML. `src/lib/bbcode.ts` has a small hand-rolled BBCode parser/renderer (`parseBBCode` / `bbRenderNode` / `renderDescription`) that only allows a fixed tag allowlist and sanitizes `url`/`img` targets to absolute `http(s)` via `bbSafeUrl` — treat this as the app's XSS boundary if you touch it (see the XSS-focused cases in `tests/modExtractor.test.ts`).
- `toCollectionUrl` in `src/lib/modLogic.ts` intentionally mirrors `extractCollectionId` in `src/lib/server/steamApi.ts`; if you change one, check whether the other needs the matching update.
- Export/import payloads are versioned (`EXPORT_SCHEMA_VERSION` in `src/lib/exportImport.ts`); a schema-shape change requires bumping the version and updating `parseImportPayload`'s validators (`isModEntry`/`isCuratedItem`/`isExportedSource`), since old exports are rejected outright rather than migrated.

### Styling

Tailwind CSS v4 (`@tailwindcss/vite`). `src/styles/global.css` is the single stylesheet entry point (`@import "tailwindcss"; @import "./theme.css";` plus a handful of plain-CSS rules — keyframes, link colors, `.mx-scroll` scrollbar theming — that have no Tailwind utility equivalent), imported once in `src/layouts/Layout.astro`. Project Zomboid-themed palette/fonts live in `src/styles/theme.css` as a Tailwind `@theme` block, so each token is both a CSS custom property (`var(--color-knox-void)`) and a utility class (`bg-knox-void`, `font-header`, ...).

Components use Tailwind utility classes in `class="..."` props rather than inline `style`. Conditional/stateful styling (selected/active/disabled row and button states) uses small helper functions in `src/lib/styles.ts` that return a class-name string based on state (e.g. `rowStyle(selected, addable)`, `sourcePanelStyle(kind)`, `headerCopyBtnStyle(active)`) — follow that pattern for new conditional UI rather than writing `style="..."` by hand. The one exception is `bbcode.ts`'s BBCode-to-HTML rendering: those fragments render arbitrary Steam Workshop description content, so they keep inline styles (Tailwind can't statically discover classes generated from dynamic content).

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

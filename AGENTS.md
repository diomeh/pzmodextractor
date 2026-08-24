# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PZ Mod Extractor — an Astro + Cloudflare Workers app that turns a Steam Workshop collection (URL or ID) into a ready-to-paste Project Zomboid mod list (`WorkshopItems=`, `Mods=`, `ModList=`). There's also a standalone Tampermonkey userscript that does the same conversion directly on Steam Workshop pages.

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
| `pnpm generate-types` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` bindings via `wrangler types` |
| `pnpm astro check` | Type-check `.astro` files and the project |
| `pnpm astro -- --help` | Astro CLI help |

There is no test suite or linter configured in this repo.

## Architecture

The app is deployed as a Cloudflare Worker via `@astrojs/cloudflare` (see `astro.config.mjs`, `wrangler.jsonc`). `wrangler.jsonc` points `main` at the Cloudflare adapter's server entrypoint and serves the Astro build output (`./dist`) as static assets. Regenerate `worker-configuration.d.ts` with `pnpm generate-types` after changing bindings in `wrangler.jsonc`.

Two independent implementations share the same conversion logic and constants (Steam API endpoints, `Workshop ?ID:` / `Mod ?ID:` regex patterns) — keep them in sync when changing extraction behavior:

- **Web app** — `src/pages/api/convert.ts` (server) + `src/scripts/modExtractor.ts` (client)
- **Userscript** — `userscripts/pz-collection-to-modstring.user.js`, a self-contained Tampermonkey script for use directly on `steamcommunity.com` (uses `GM_xmlhttpRequest` instead of `fetch`)

### Web app data flow

1. `src/pages/index.astro` renders a single empty `#app` mount point and loads `src/scripts/modExtractor.ts`.
2. `modExtractor.ts` defines `ModExtractorApp`, a small vanilla-TS class-based UI (no framework) that owns all state, re-renders by rebuilding `innerHTML` on every `setState`, and restores focus/selection/scroll position afterward (see `render()`). All DOM events are delegated through `data-action` attributes on the root element, dispatched in `handleClick`.
3. On submit, the client POSTs the raw user input to `POST /api/convert` (`src/pages/api/convert.ts`, `export const prerender = false`).
4. The API route resolves a collection ID from the input, calls the Steam Web API (`ISteamRemoteStorage/GetCollectionDetails` then `GetPublishedFileDetails`, chunked 50 at a time), extracts `Workshop ID:` / `Mod ID:` values from each item's BBCode description via regex, and returns a flat `mods[]` array.
5. The client renders the results screen: a filterable Workshop list on the left, a curated/orderable Mod ID list on the right (drag-and-drop reorder), and generated `WorkshopItems=` / `Mods=` / `ModList=` output rows with copy-to-clipboard.

Notable details worth knowing before touching `modExtractor.ts`:
- A mod can declare multiple Mod IDs in one description (e.g. optional variants); the UI lets the user check specific IDs to add rather than forcing a single pick, and uses a heuristic regex (`EXCLUSIVE_HINT_PATTERN`) to warn when the description's prose suggests the IDs are mutually-exclusive branches.
- Workshop descriptions are BBCode, not HTML. There's a small hand-rolled BBCode parser/renderer (`parseBBCode` / `bbRenderNode`) that only allows a fixed tag allowlist and sanitizes `url`/`img` targets to absolute `http(s)` — treat this as the app's XSS boundary if you touch it.
- `toCollectionUrl` in the client intentionally mirrors `extractCollectionId` in `src/pages/api/convert.ts`; if you change one, check whether the other needs the matching update.

### Styling

Global design tokens (Project Zomboid-themed palette/fonts) live in `src/styles/theme.css` as CSS custom properties, imported once in `src/layouts/Layout.astro`. `modExtractor.ts` currently renders with inline styles built from JS style-string helper functions (e.g. `rowStyle`, `addBtnStyle`) rather than CSS classes — follow that pattern for new UI in that file rather than introducing a separate stylesheet.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

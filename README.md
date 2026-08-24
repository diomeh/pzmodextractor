# PZ Mod Extractor

![Version](https://img.shields.io/badge/version-0.5.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Turns one or more Steam Workshop collections/items — a URL, a bare ID, or a comma/newline-separated mix of both — into a ready-to-paste Project Zomboid mod list (`WorkshopItems=`, `Mods=`, `ModList=`).

Ships as two independent implementations of the same extraction logic:

- **Web app** — an Astro + Preact site deployed to Cloudflare Workers (see [Deployment](#deployment)).
- **Userscript** — a self-contained Tampermonkey script that runs the same extraction directly on `steamcommunity.com` pages, no server required.

## Table Of Contents

- [PZ Mod Extractor](#pz-mod-extractor)
  - [Table Of Contents](#table-of-contents)
  - [Features](#features)
  - [Architecture](#architecture)
  - [Local setup](#local-setup)
  - [Userscript](#userscript)
    - [Install](#install)
    - [Attribution](#attribution)
  - [Deployment](#deployment)
  - [Versioning](#versioning)
  - [License](#license)
  - [Code of Conduct](#code-of-conduct)
  - [Contributing](#contributing)
    - [Commit Message Format](#commit-message-format)

## Features

- Paste any mix of collection links, item links, or bare Steam Workshop IDs — multiple collections are tracked as separate sources, and loose items are collected into a persistent "Custom" source.
- Resolves each collection/item against the Steam Web API and extracts `Workshop ID:` / `Mod ID:` values from each item's BBCode description via regex.
- Renders workshop descriptions safely: BBCode is parsed and sanitized through an allowlist (no raw HTML from Steam ever reaches the page).
- Handles mods that declare more than one Mod ID (e.g. optional variants) by letting you pick exactly which ones to include, with a heuristic warning when the description implies the options are mutually exclusive.
- Builds a single ordered "Mod ID List" merged from all sources, ready to export as `WorkshopItems=` / `Mods=` / `ModList=` lines for your PZ server config.
- Export/import the whole session (sources + curated list) as a versioned JSON file.

## Architecture

- `src/pages/api/convert.ts` + `src/lib/server/steamApi.ts` — server-side resolution against the Steam Web API (`ISteamRemoteStorage/GetCollectionDetails`, then `GetPublishedFileDetails`, chunked 50 at a time), no API key required.
- `src/hooks/useModExtractor.ts` — the app's single state owner (`useReducer` over a discriminated-union `Action` type).
- `src/hooks/useSteamFetch.ts` / `src/hooks/useExportImport.ts` — network calls and JSON export/import.
- `src/components/` — presentational Preact components (`ResultsScreen`, `SourcePanel`, `CuratedList`, etc.), all driven by `state`/`actions` props.
- `src/lib/bbcode.ts` — the hand-rolled BBCode parser/renderer that acts as the app's XSS boundary.
- `userscripts/pz-collection-to-modstring.user.js` — the standalone Tampermonkey equivalent (see [Userscript](#userscript) below).

The web app and userscript deliberately duplicate the extraction regexes rather than sharing a build pipeline; `tests/userscript-parity.test.ts` fails automatically if the two drift apart. See [`CLAUDE.md`](CLAUDE.md) for the full architecture writeup, including the multi-source data model and styling conventions.

## Local setup

Prerequisites:

- Node.js >= 22.12.0
- [pnpm](https://pnpm.io/) (see `pnpm-lock.yaml` / `pnpm-workspace.yaml`)

Install and run

```sh
pnpm install
pnpm dev          # starts the dev server at http://localhost:4321
```

No environment variables or API keys are required — the Steam Web API endpoints used here are public.

Other useful commands:

| Command                | Action                                                                                     |
| ---------------------- | :----------------------------------------------------------------------------------------- |
| `pnpm build`           | Build production site to `./dist/`                                                         |
| `pnpm preview`         | Preview the build locally                                                                  |
| `pnpm test`            | Run the vitest suite once (`tests/**/*.test.ts`)                                           |
| `pnpm test:watch`      | Run vitest in watch mode                                                                   |
| `pnpm generate-types`  | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` bindings via `wrangler types` |
| `pnpm astro check`     | Type-check `.astro`/`.tsx` files and the project                                           |
| `pnpm astro -- --help` | Astro CLI help                                                                             |

To run a single test file: `pnpm exec vitest run tests/modExtractor.test.ts`.

Playwright is available as a devDependency for ad hoc browser verification of UI changes (install the browser once with `npx playwright install chromium`); it isn't wired up as a test runner.

## Userscript

`userscripts/pz-collection-to-modstring.user.js` is a self-contained Tampermonkey script that runs the same collection-to-modlist extraction directly on a Steam Workshop collection or item page (`steamcommunity.com/sharedfiles/filedetails/*` and `steamcommunity.com/workshop/filedetails/*`), using `GM_xmlhttpRequest` instead of `fetch`.

### Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager) in your browser.
2. Open `userscripts/pz-collection-to-modstring.user.js`, copy its contents, and create a new script in Tampermonkey with that content (or point Tampermonkey at the raw file directly).
3. Visit any Steam Workshop collection or item page — the script activates automatically via its `@match` rules.

### Attribution

This userscript is based on a technique originally shared by [Saturate](https://gist.github.com/Saturate/1519244dee074f3b6afdea349580f0e0?permalink_comment_id=5004466#gistcomment-5004466) for extracting Workshop/Mod IDs from Steam collection pages.

## Deployment

The web app deploys as a Cloudflare Worker via `@astrojs/cloudflare` (see `astro.config.mjs`, `wrangler.jsonc`), serving the Astro build output (`./dist`) as static assets.

```sh
pnpm deploy   # astro build && wrangler deploy --env production
```

Before your first deploy:

1. Authenticate wrangler against your Cloudflare account (`pnpm exec wrangler login`).
2. `wrangler.jsonc` ships with `workers_dev: false` and no `routes`, so the Worker won't be reachable on a public URL until you either add a route/custom domain in `wrangler.jsonc`, or flip `workers_dev` to `true` for a `*.workers.dev` URL while testing.
3. If you change any bindings in `wrangler.jsonc`, regenerate types with `pnpm generate-types` before building.

## Versioning

This project follows [Semantic Versioning](https://semver.org/). The current version, `0.5.0`, was derived from the commit history by classifying each commit under [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) semantics (`feat` → minor bump, everything else → patch bump, while the project stays pre-1.0)

Going forward, commits should follow the Conventional Commits format described in [Contributing](#contributing) so this mapping stays accurate.

## License

Licensed under the [MIT License](LICENSE) © 2026 David Urbina.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Contributing

Contributions are welcome! Feel free to submit a pull request or open an issue if you have any suggestions or feedback.

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md)
and the [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/).

### Commit Message Format

From the Conventional Commits Specification [Summary](https://www.conventionalcommits.org/en/v1.0.0/#summary):

The commit message should be structured as follows:

```plaintext
{type}[optional scope]: {description}

[optional body]

[optional footer(s)]
```

Where `type` is one of the following:

| Type              | Description                                                                                             | Example Commit Message                   |
| ----------------- | :------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `fix`             | Patches a bug in your codebase (correlates with PATCH in Semantic Versioning)                           | `fix: correct typo in README`            |
| `feat`            | Introduces a new feature to the codebase (correlates with MINOR in Semantic Versioning)                 | `feat: add new user login functionality` |
| `BREAKING CHANGE` | Introduces a breaking API change (correlates with MAJOR in Semantic Versioning)                         | `feat!: drop support for Node 8`         |
| `build`           | Changes that affect the build system or external dependencies                                           | `build: update dependency version`       |
| `chore`           | Other changes that don't modify src or test files                                                       | `chore: update package.json scripts`     |
| `ci`              | Changes to CI configuration files and scripts                                                           | `ci: add CircleCI config`                |
| `docs`            | Documentation only changes                                                                              | `docs: update API documentation`         |
| `style`           | Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.) | `style: fix linting errors`              |
| `refactor`        | Code change that neither fixes a bug nor adds a feature                                                 | `refactor: rename variable for clarity`  |
| `perf`            | Code change that improves performance                                                                   | `perf: reduce size of image files`       |
| `test`            | Adding missing tests or correcting existing tests                                                       | `test: add unit tests for new feature`   |

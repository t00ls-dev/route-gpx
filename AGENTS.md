# Working on route-gpx

This file is the single source of agent instructions. `CLAUDE.md` only imports it for Claude Code and adds tool-specific notes; keep project instructions here.

## Purpose and scope

route-gpx is a static route planner with GPX import/export, built with HTML, strict TypeScript, Vite and Leaflet. It runs in the browser. It is published on GitHub Pages at the custom domain `https://route-gpx.t00ls.dev/` with a `/` base; the old project URL `https://t00ls-dev.github.io/route-gpx/` redirects there. There is no application backend, account system, analytics or remote AI. Keep changes compatible with this architecture unless the task explicitly changes it.

Present the project as a route planner with GPX export. Keep public introductions, SEO and sharing assets neutral about transport mode and languages. Language support belongs in the interface selector and the two READMEs; do not promote it as a project tagline. Preserve accurate technical explanations of the routing services and their current driving profile where they explain behavior or configuration.

Route creation uses addresses, coordinates and map points. The route-description interpreter has been removed; keep this direct editing flow simple.

## Where changes belong

| File                                                                                | Responsibility                                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `src/main.ts`                                                         | Application markup and orchestration: point editor, Leaflet map, routing lifecycle, import/download, settings, URL state and saved-route UI. |
| `src/core.ts`                                                                       | Shared types, defaults, coordinate and server validation, versioned URL state, GPX import/export and road summaries.                         |
| `src/services.ts`                                                                   | OSRM and Valhalla adapters, geometry conversion, serialized request queues and Nominatim search/cache.                                       |
| `src/saved-routes.ts`                                                               | IndexedDB library, normalized route-name identity, backup serialization, validation and import.                                              |
| `src/weather.ts`, `src/weather-risk.ts`, `src/weather-wind.ts`, `src/weather-ui.ts` | Weather sampling, passage times, date bounds, risk thresholds and map/card interactions.                                                     |
| `src/radar.ts`, `src/radar-ui.ts`                                                   | Recent RainViewer observations, bounded memory cache and visible-frame map overlay.                                                          |
| `src/weather-cache.ts`, `src/routing-cache.ts`                                      | Bounded page-memory caches, with no persistent location storage.                                                                             |
| `src/history.ts`                                                                    | In-memory undo snapshots.                                                                                                                    |
| `src/units.ts`, `src/travel-time.ts`                                                | Display units, speed bounds/conversion and optional duration estimates.                                                                      |
| `src/i18n.ts`                                                                       | English source-text keys, Portuguese translations, dynamic patterns and DOM translation.                                                     |
| `help.html`, `src/help.ts`                                                          | Separate help page and its language selection.                                                                                               |
| `src/seo.ts`                                                                        | Runtime localized titles and descriptions for app/help.                                                                                      |
| `src/style.css`, `docs/BRAND.md`                                                    | Shared styling and brand guidance.                                                                                                           |
| `public/`                                                                           | Static metadata, manifest, sitemap, SVG sources and generated brand images.                                                                  |

Repository governance lives outside the application code: `CONTRIBUTING.md` (contributor workflow and rules), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private vulnerability reporting and scope), `.github/ISSUE_TEMPLATE/` (bug and feature forms, contact links), `.github/pull_request_template.md` (PR checklist) and `.github/dependabot.yml` (weekly npm and GitHub Actions updates). Keep them in English and consistent with this file.

Keep calculation and validation logic in the relevant module rather than adding it to DOM handlers. Follow the existing TypeScript modules and Prettier style; a UI change does not require introducing a framework.

## Contracts to preserve

- `Coord` is `[latitude, longitude]`. OSRM URLs and GeoJSON use longitude first; convert at the adapter boundary. Preserve every full-resolution track point and separate GPX track segments. Escape user-provided XML text.
- Imported GPX geometry remains exact until a point edit causes rerouting. A share link stores controls/options, not that geometry, and recalculates when opened. Do not imply that links preserve imported tracks.
- `State` uses version 1 and the `#v1=` encoding. Keep existing links and the advanced JSON editor compatible; use the existing validation rather than trusting parsed JSON. Browser initialization tolerates obsolete speed values without discarding valid route points.
- Editing a route invalidates the current result and disables stale downloads. Preserve revision checks and discard superseded work so late routing/search responses cannot overwrite newer input or another point's results.
- Language, distance units and GPX coordinates are independent. Unit changes must not reroute or alter geometry. Average speed changes the duration estimate; disabling it restores the router estimate.
- Undo retains up to 50 snapshots in memory. Preserve point move/removal/reordering behavior and the keyboard shortcut's exclusion of text inputs.
- Routes are saved only by an explicit named save. IndexedDB entries use normalized names for updates; reopening/downloading stored geometry must not request a new route. Storage failure must leave ordinary GPX download usable.
- Backups use the `route-gpx-library` version 1 format. Validate the complete import before writing and keep existing entries with matching names. Do not silently discard saved data or change persistence formats without handling compatibility.
- “Prefer main roads” is a heuristic review aid, not a guarantee. Keep provider road references factual; do not invent classifications.

## Network behavior and privacy

Use the adapters in `src/services.ts` for routing/search. OSRM is primary, with a delayed Valhalla fallback. Preserve serialized routing starts at least 1.5 seconds apart, the 900 ms route-change debounce, and suppression of stale queued calculations. Do not introduce retry loops.

Nominatim searches are explicitly triggered with Enter, not autocomplete. Photon suggests places while typing; do not restore the removed search buttons. Preserve the 500 ms UI debounce, 1.1-second search spacing, in-memory query cache and cross-tab coordination through Web Locks/timestamp storage where available. The timestamp is not a location store. Client-side limits do not enforce aggregate traffic limits across devices.

Keep fetch credentials omitted and service URL validation intact. Retain visible OpenStreetMap attribution. Do not add tile prefetching, bulk downloads or offline tile caching. Locations belong only in the existing explicit route/link/storage flows; canonical URLs, social metadata and sitemap entries must never contain user route state.

Weather is optional: no departure date means no Open-Meteo request. A valid date triggers a debounced request automatically. Support the last 90 UTC calendar days and the 16-day forecast horizon. Sample about every 20 km (or one hour for slow travel), including controls, with at most 20 points/cards/markers. Use a worst-case ±1 hour window rounded outward. Keep weather and sampling coordinates in page memory only; only departure belongs in existing explicit route/link/backup flows. Wind direction is meteorological (from), compared with the local full-resolution track bearing; use the outgoing edge at bends and incoming edge at the destination, never GPX segment gaps. Show head/tail/crosswind at the nearest hour in selected units; do not imply apparent wind or vehicle resistance. Do not restore the removed planned-stop field or forecast button. Slower speeds may require additional points; otherwise recalculate times locally.

Keep route caching bounded to 20 results for 15 minutes; Calculate route bypasses it. Weather caches are per rounded location and interval, at most 200 locations/100,000 hourly entries for ten minutes. Cache hits must not extend freshness. All these caches stay in page memory. Map wind arrows show the direction wind blows toward; colors indicate head/tail/crosswind relative to the route; calm or unknown is neutral. Mean-wind strength remains separate from gust risk thresholds.

Radar is off by default, independent of departure, and uses only recent observations (not future rain/cloud prediction). Fetch only visible tiles of the selected frame, with no prefetch or persistent cache. Preserve shared request spacing, cancellation and the bounded memory cache. Keep weather/radar attribution in the existing map credits dialog. No service worker or installation flow.

## Interface, text and assets

Do not add project UI screenshots to the repository or READMEs. Use the project logo for presentation; existing icon and social metadata brand assets are allowed. Keep local acceptance captures in an ignored `*.local/` directory.

Never use emoji characters as authored interface icons or decoration. Use the shared inline SVG system in `src/icons.ts`, with a 24-unit viewBox, 2-unit strokes, rounded ends and `currentColor`. Apply it to weather cards/markers, alerts and controls. Decorative SVGs must be hidden from assistive technology; retain meaningful text and accessible names. Preserve user-provided route names and required copyright attribution as text.

Use at least 16px text in editable touch controls to avoid iOS focus zoom; preserve pinch zoom. Keep the compact mobile layout, keyboard-accessible controls and high-contrast light theme, including when the OS prefers dark mode. Use the separate help page for detailed instructions.

Keep English source keys and Portuguese translations together in `src/i18n.ts`; check both language directions. Keep redistributed dependency notices in `public/THIRD_PARTY_NOTICES.txt` and link them from both READMEs and help. Adding or changing an external service requires updating both READMEs, help, privacy disclosures and required source/license credits.

When changing English UI text, update its exact key or dynamic pattern in `src/i18n.ts` and verify switching back and forth. Translation caches original DOM text and selected attributes; do not replace this mechanism casually. Update both READMEs and help instructions when user-visible behavior changes.

### README parity and scope

Treat `README.md` and `README.pt-BR.md` as translations of the same document. Update both in the same change: keep the same sections, order, features, limitations, examples, commands and link destinations. Only the language should differ, including translated UI labels; the top language link points to the counterpart file. Do not make either README depend on the other for additional technical content.

Keep both READMEs focused on project purpose, main features, quick start, essential behavior/limitations and privacy, local development, validation, deployment overview and credits/license. Link to the help page or dedicated documentation for detailed instructions and infrastructure tutorials rather than expanding one README into a manual. Keep public introductions neutral as described above.

When editing the READMEs, review them side by side for semantic parity, confirm that command blocks match, check local links and npm script names, and run `npm run format:check`. Structural checks support this review but do not replace checking the translation's meaning.

For public-description changes, review `index.html` and `help.html` title/description, Open Graph and Twitter tags, JSON-LD, `src/seo.ts`, manifest, social card, README openings and related tests. Keep initial HTML and runtime metadata consistent.

Edit SVG brand sources, then run `node scripts/generate-brand.mjs` to regenerate PNGs (requires Playwright Chromium). Review the diff: the script also regenerates icons. Do not hand-edit generated images or `dist/`.

## Local validation

Use Node.js 22 LTS 22.23.4 or newer, Node 24 or Node 26+ (CI uses Node 22.23.4) and `npm ci` for a reproducible install. `npm run dev` serves the application at `http://localhost:5173/` by default; the help page is a second Vite entry.

For application changes, run the CI checks:

```sh
npm run lint
npm run format:check
npm test
npm run test:browser
npm run build
```

Install Chromium with `npx playwright install chromium` if needed. Playwright starts its own dev server on `127.0.0.1:5173`; avoid an unrelated server occupying that port. For documentation-only edits, run `npm run format:check` and check the documented commands/paths against the repository; no application test is needed solely for prose.

- Regular tests must mock all external HTTP services, including tiles and IP lookup. Date-sensitive tests must fix the clock. Keep tests independent of execution order, shared files and persistent state across workers or shards; the opt-in live integration/acceptance commands are the explicit exceptions.
- Vitest runs `tests/**/*.test.ts` in jsdom. Cover core/GPX, state, service adapters, history, units/time, translations and backup validation in their corresponding files when changing those contracts.
- Playwright runs `tests/*.spec.ts` in Chromium with one worker. `points.spec.ts` covers desktop/mobile workflows and storage/download regressions; `metadata.spec.ts` covers localized SEO and Pages assets. Extend relevant scenarios for behavioral regressions and mock public services as existing tests do.
- `npm run test:integration` is opt-in and calls real public OSRM. Its default skip is expected; report whether it actually ran.
- `node scripts/browser-check.mjs` is a separate acceptance script requiring a local server, or `SITE_URL` for a deployed site. It calls real routing, reads `docs/example.gpx` as a fixture and writes captures, downloaded GPX and its report only to the ignored `.browser-check.local/` folder. Never overwrite the tracked fixture or add generated screenshots/reports to the repository. Run it only when those live checks are relevant and avoid repeated public-service traffic.

The complete browser suite runs with `npm run test:browser`; a local shard runs with `npm run test:browser -- --shard=1/2` (and `2/2`). CI currently runs the full suite, unsharded, with one Chromium worker and a development server. CI sharding, production-preview testing and report merging remain pending; do not describe them as implemented.

Keep the existing minimatch override while upstream tools resolve vulnerable 10.x releases (GHSA-g3hv-75wg-m249); verify with `npm audit` before removing it.

`npx knip` recognizes the two documented manual scripts through `knip.json`. Keep migrations and legacy state/backup compatibility even when static analysis suggests otherwise. Generated reports and local acceptance files belong in the ignored output directories.

Report commands actually executed, failures and skipped/live checks accurately. Do not create tests that merely duplicate prose or implementation details.

## Git and GitHub operations

Use the local `git` and `gh` executables for Git and GitHub operations. Do not replace them with GitHub APIs or connectors integrated into the harness. Calls through the local `gh api` command are permitted.

Use the existing authentication; do not create parallel credentials. Do not add authorship credits to Codex, Claude Code, OpenAI or Anthropic in commits, pull requests, code or documentation, including `Co-authored-by` trailers. Preserve existing licenses, mandatory legal attribution and repository history.

`main` is protected by the `Protect main` repository ruleset: pull requests are required, merges are squash-only with linear history, the `Lint, test and build` CI check must pass on a branch that is up to date with `main`, and review conversations must be resolved. Force-pushes and deletion are blocked, and the ruleset has no bypass actors. Never push directly to `main` or try to work around these protections.

Changes reach `main` only through pull requests. Create a focused branch named `<type>/<short-description>` (for example `fix/gpx-import-names`), push it, open the PR with `gh pr create` following `.github/pull_request_template.md`, watch its CI run and merge with `gh pr merge --squash --delete-branch` only when the merge is authorized. The PR title becomes the squash commit title, so write it in the history's concise imperative English style.

Renaming the CI job breaks the required check; such a change must update the ruleset in the same authorized task. Changing, disabling or bypassing rulesets, merge settings or security features (Dependabot alerts and security updates, private vulnerability reporting) is a separate repository-administration task that needs its own authorization.

## Hosting and publication

Pages serves the custom-domain root with an approved certificate and enforced HTTPS. Changing the Pages domain, DNS or HTTPS settings is a separate authorized infrastructure task. Preserve Vite's `/` base for the custom domain and the app/help build entries. A hosting-path change also requires reviewing manifest `id`/`start_url`/`scope`, canonical/social URLs, sitemap and docs; root-relative paths can break on a Pages project site.

Two workflows handle checks and publication. `.github/workflows/ci.yml` (CI) runs the checks for pull requests, main pushes and manual dispatch with only `contents: read`, in the non-cancelling `ci-<ref>` concurrency group. `.github/workflows/deploy.yml` (Deploy) runs through `workflow_run` only after a CI run triggered by a push to `main` succeeds; it rebuilds that run's exact `head_sha` and publishes it to Pages. Preserve Deploy's `pages: write` and `id-token: write`, its non-cancelling `pages` concurrency group and its current-main guard, which skips publication when the commit is no longer the current `main` so an older commit cannot publish over a newer one. Keep Pages permissions out of CI and do not add a manual trigger to Deploy. Never rerun old workflow executions to publish; watch only the runs belonging to the authorized new commit.

When publication is part of the task, deliver the change through an authorized pull request as described above; the push to `main` comes from its squash merge. Then follow the CI run for the merge commit on `main` and the Deploy run it triggers with `gh run watch <id> --exit-status`, and distinguish successful checks from successful deployment. Confirm the requested behavior on the live site; do not infer it from a green build alone.

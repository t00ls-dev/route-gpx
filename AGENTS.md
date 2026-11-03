# Working on route-gpx

## Purpose and scope

route-gpx is a static route planner with GPX import/export, built with HTML, strict TypeScript, Vite and Leaflet. It runs in the browser and deploys to GitHub Pages under `/route-gpx/`. There is no application backend, account system, analytics or remote AI. Keep changes compatible with this architecture unless the task explicitly changes it.

Present the project as a route planner with GPX export. Keep public introductions, SEO and sharing assets neutral about transport mode and languages. Language support belongs in the interface selector and the two READMEs; do not promote it as a project tagline. Preserve accurate technical explanations of the routing services and their current driving profile where they explain behavior or configuration.

Route creation uses addresses, coordinates and map points. The route-description interpreter has been removed; keep this direct editing flow simple.

## Where changes belong

| File                                 | Responsibility                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `src/main.ts`          | Application markup and orchestration: point editor, Leaflet map, routing lifecycle, import/download, settings, URL state and saved-route UI. |
| `src/core.ts`                        | Shared types, defaults, coordinate and server validation, versioned URL state, GPX import/export and road summaries.                         |
| `src/services.ts`                    | OSRM and Valhalla adapters, geometry conversion, serialized request queues and Nominatim search/cache.                                       |
| `src/saved-routes.ts`                | IndexedDB library, normalized route-name identity, backup serialization, validation and import.                                              |
| `src/history.ts`                     | In-memory undo snapshots.                                                                                                                    |
| `src/units.ts`, `src/travel-time.ts` | Display units, speed bounds/conversion and optional duration estimates.                                                                      |
| `src/i18n.ts`                        | English source-text keys, Portuguese translations, dynamic patterns and DOM translation.                                                     |
| `help.html`, `src/help.ts`           | Separate help page and its language selection.                                                                                               |
| `src/seo.ts`                         | Runtime localized titles and descriptions for app/help.                                                                                      |
| `src/style.css`, `docs/BRAND.md`     | Shared styling and brand guidance.                                                                                                           |
| `public/`                            | Static metadata, manifest, sitemap, SVG sources and generated brand images.                                                                  |

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

Nominatim searches are explicitly triggered, not autocomplete. Preserve the 500 ms UI debounce, 1.1-second search spacing, in-memory query cache and cross-tab coordination through Web Locks/timestamp storage where available. The timestamp is not a location store. Client-side limits do not enforce aggregate traffic limits across devices.

Keep fetch credentials omitted and service URL validation intact. Retain visible OpenStreetMap attribution. Do not add tile prefetching, bulk downloads or offline tile caching. Locations belong only in the existing explicit route/link/storage flows; canonical URLs, social metadata and sitemap entries must never contain user route state.

## Interface, text and assets

Keep the compact mobile layout, keyboard-accessible controls and high-contrast light theme, including when the OS prefers dark mode. Use the separate help page for detailed instructions.

When changing English UI text, update its exact key or dynamic pattern in `src/i18n.ts` and verify switching back and forth. Translation caches original DOM text and selected attributes; do not replace this mechanism casually. Update both READMEs and help instructions when user-visible behavior changes.

### README parity and scope

Treat `README.md` and `README.pt-BR.md` as translations of the same document. Update both in the same change: keep the same sections, order, features, limitations, examples, commands and link destinations. Only the language should differ, including translated UI labels; the top language link points to the counterpart file. Do not make either README depend on the other for additional technical content.

Keep both READMEs focused on project purpose, main features, quick start, essential behavior/limitations and privacy, local development, validation, deployment overview and credits/license. Link to the help page or dedicated documentation for detailed instructions and infrastructure tutorials rather than expanding one README into a manual. Keep public introductions neutral as described above.

When editing the READMEs, review them side by side for semantic parity, confirm that command blocks match, check local links and npm script names, and run `npm run format:check`. Structural checks support this review but do not replace checking the translation's meaning.

For public-description changes, review `index.html` and `help.html` title/description, Open Graph and Twitter tags, JSON-LD, `src/seo.ts`, manifest, social card, README openings and related tests. Keep initial HTML and runtime metadata consistent.

Edit SVG brand sources, then run `node scripts/generate-brand.mjs` to regenerate PNGs (requires Playwright Chromium). Review the diff: the script also regenerates icons. Do not hand-edit generated images or `dist/`.

## Local validation

Use Node.js 22.12 or newer (CI uses Node 22) and `npm ci` for a reproducible install. `npm run dev` serves the application at `http://localhost:5173/route-gpx/` by default; the help page is a second Vite entry.

For application changes, run the CI checks:

```sh
npm run lint
npm run format:check
npm test
npm run test:browser
npm run build
```

Install Chromium with `npx playwright install chromium` if needed. Playwright starts its own dev server on `127.0.0.1:5173`; avoid an unrelated server occupying that port. For documentation-only edits, run `npm run format:check` and check the documented commands/paths against the repository; no application test is needed solely for prose.

- Vitest runs `tests/**/*.test.ts` in jsdom. Cover core/GPX, state, service adapters, history, units/time, translations and backup validation in their corresponding files when changing those contracts.
- Playwright runs `tests/*.spec.ts` in Chromium with one worker. `points.spec.ts` covers desktop/mobile workflows and storage/download regressions; `metadata.spec.ts` covers localized SEO and Pages assets. Extend relevant scenarios for behavioral regressions and mock public services as existing tests do.
- `npm run test:integration` is opt-in and calls real public OSRM. Its default skip is expected; report whether it actually ran.
- `node scripts/browser-check.mjs` is a separate acceptance script requiring a local server, or `SITE_URL` for a deployed site. It calls real routing and rewrites screenshots, `docs/example.gpx` and `docs/browser-check.json`. Run it only when those live checks/artifacts are relevant, inspect the resulting diff and avoid repeated public-service traffic.

Report commands actually executed, failures and skipped/live checks accurately. Do not create tests that merely duplicate prose or implementation details.

## Hosting and publication

Preserve Vite's `/route-gpx/` base and the app/help build entries. A hosting-path change also requires reviewing manifest `id`/`start_url`/`scope`, canonical/social URLs, sitemap and docs; root-relative paths can break on a Pages project site.

`.github/workflows/ci-pages.yml` runs checks for pull requests and main pushes. Deployment follows a successful main build, and the current-main check prevents an older commit from publishing over a newer one. Preserve the existing non-cancelling workflow concurrency behavior.

When publication is part of the task, make a focused commit in the history's concise imperative English style, push, follow the corresponding run with `gh run watch <id> --exit-status`, and distinguish successful checks from successful deployment. Confirm the requested behavior on the live site; do not infer it from a green build alone.

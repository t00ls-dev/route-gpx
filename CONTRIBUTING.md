# Contributing to route-gpx

Thanks for your interest in improving route-gpx, a static route planner with GPX export.

## Project boundaries

These limits are fixed. Proposals that break them will not be accepted:

- It is a static site: no application backend, accounts, analytics, API keys or remote AI.
- It relies on public services (OSRM, Valhalla, Nominatim, Photon, Open-Meteo, RainViewer and the map tile providers). Changes must respect their usage policies and the existing request spacing, debouncing and caching. Do not add bulk downloads, prefetching or retry loops.
- Routing currently uses a car profile only.

For large or architectural changes, [open an issue](https://github.com/t00ls-dev/route-gpx/issues/new/choose) first so the approach can be discussed before you invest time in it.

## Setup and validation

The [Local development](README.md#local-development) and [Validation](README.md#validation) sections of the README list the install and check commands. The supported Node.js versions are set by the `engines` field in [`package.json`](package.json). Run the full validation before opening a pull request and report the real results.

## Workflow

1. Fork the repository (or create a branch if you have write access) and keep each pull request focused on one change.
2. `main` is protected. Changes reach it only through pull requests that:
   - pass the `Lint, test and build` CI check;
   - are up to date with `main`;
   - have all review conversations resolved;
   - are merged with squash only.
3. The pull request title becomes the commit title on `main`. Write it in concise, imperative English, matching the existing history (for example, `Keep the chosen language across reloads`).

## Rules for changes

Repository documentation, templates, code comments, commit messages, pull request titles and bodies, and GitHub repository text must be in English. Preserve Portuguese website interface text and tests, localized metadata, user-provided names and required attribution.

- UI text changes update [`src/i18n.ts`](src/i18n.ts) with the English key and the Portuguese translation; check switching languages in both directions.
- User-visible behavior changes update the README ([`README.md`](README.md)) and the help page ([`help.html`](help.html)).
- New or changed external services also update the privacy disclosures and credits (see [`docs/SERVICES.md`](docs/SERVICES.md)).
- Do not commit UI screenshots or generated files.
- Do not use emoji as interface icons; use the shared SVG icons in [`src/icons.ts`](src/icons.ts).
- Tests must mock every external HTTP service.

## AI-assisted contributions

Contributions made with AI tools are welcome when the author has reviewed, understood and tested the change. [`AGENTS.md`](AGENTS.md) holds the detailed instructions used by coding agents and is a useful reference for anyone working on the code.

## Community

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security vulnerabilities privately as described in the [security policy](SECURITY.md), never in public issues.

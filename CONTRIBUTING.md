# Contributing to route-gpx

Thanks for your interest in improving route-gpx, a static route planner with GPX export.

## Project boundaries

These limits are fixed. Proposals that break them will not be accepted:

- It is a static site: no application backend, accounts, analytics, API keys or remote AI.
- It relies on public services (OSRM, Valhalla, Nominatim, Photon, Open-Meteo and the map tile providers). Changes must respect their usage policies and the existing request spacing, debouncing and caching. Do not add bulk downloads, prefetching or retry loops.
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
- User-visible changes add an entry to [`CHANGELOG.md`](CHANGELOG.md) and, in English and Portuguese, to the What's new page ([`changelog.html`](changelog.html)), under Unreleased in the matching section (Added, Changed, Deprecated, Removed, Fixed or Security). Write it for site users, not contributors; internal changes (CI, dependencies, tests, repository documentation) have no entry.
- Changes to main features, file formats, external services or public pages, and every change to the help or What's new pages, check the SEO metadata (page titles and descriptions in both languages, [`src/seo.ts`](src/seo.ts), JSON-LD) and update [`public/sitemap.xml`](public/sitemap.xml), including each changed page's `lastmod`; a new public page also needs a Vite build entry and a sitemap entry.
- New or changed external services also update the privacy disclosures and credits (see [`docs/SERVICES.md`](docs/SERVICES.md)).
- Do not commit UI screenshots or generated files.
- Do not use emoji as interface icons; use the shared SVG icons in [`src/icons.ts`](src/icons.ts).
- Tests must mock every external HTTP service.

## Releases

Releases are made by hand by the maintainer, without release tooling. Versions follow [Semantic Versioning](https://semver.org/) for the site as users see it: major for a change that stops something users keep (share links, saved routes, backups, exported GPX) from working, minor for new features, patch for fixes only. The app version is separate from the version numbers inside links and backups.

1. In a pull request, rename `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) to `## [x.y.z] - YYYY-MM-DD` (the merge date, UTC), add an empty `## [Unreleased]` above it and update the link references at the end. Make the same change in both languages of [`changelog.html`](changelog.html), and set the version with `npm version x.y.z --no-git-tag-version`.
2. After the squash merge, tag the merge commit and publish the notes: `gh release create vx.y.z --target <merge commit> --title vx.y.z --notes-file <notes>`, with that version's changelog section as notes.

## AI-assisted contributions

Contributions made with AI tools are welcome when the author has reviewed, understood and tested the change. [`AGENTS.md`](AGENTS.md) holds the detailed instructions used by coding agents and is a useful reference for anyone working on the code.

## Community

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security vulnerabilities privately as described in the [security policy](SECURITY.md), never in public issues.

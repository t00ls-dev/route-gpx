# Security policy

## Supported version

Only the current `main` branch, published at <https://route-gpx.t00ls.dev/>, is supported.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/t00ls-dev/route-gpx/security/advisories/new). Do not open public issues for security problems.

Include the affected page or file, steps to reproduce and the impact you expect. Avoid sharing real personal locations; use example routes where possible.

## Scope

In scope: the code in this repository, its build and the GitHub Pages configuration. Examples:

- cross-site scripting through imported GPX files, route names or share links;
- unsafe handling of configurable service URLs;
- location data leaking outside the documented route, link and storage flows.

Out of scope: problems in the third-party services the app uses (OSRM, Valhalla, Nominatim, Photon, map tile providers, Open-Meteo, RainViewer and ipwho.is). Please report those to their operators.

## Response

This is a volunteer project. Reports are handled on a best-effort basis, and there is no bug bounty program.

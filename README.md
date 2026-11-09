# <img src="public/icons/icon.svg" width="48" height="48" alt="" align="absmiddle" /> route-gpx

Plan routes and export the complete track as GPX.

A static web tool that turns addresses, coordinates and map points into a GPX 1.1 file with the complete track and named waypoints, with no account, API key or application backend.

## Features

- **Plan:** set start, destination and stops with addresses, coordinates, map clicks or your location.
- **Edit:** move and reorder points, reverse the route, add a return trip, undo changes and lock the route against accidental edits.
- **Review:** distance, estimated duration and road references, in kilometers or miles, estimated from your own average speed (remembered on this device), plus sunrise, sunset and sections in the dark for a departure time.
- **GPX:** import files up to 10 MB and export GPX 1.1 with complete track segments and named waypoints.
- **Weather:** conditions and risks along the route for a departure date, including recent past dates.

- **Map layers:** standard, topographic and satellite maps, with optional labels.
- **Save and share:** route links, named routes saved in this browser and JSON backup import/export.
- **Interface:** available in English and Portuguese.

## Quick start

1. Open [route-gpx.t00ls.dev](https://route-gpx.t00ls.dev/).
2. Enter addresses or `latitude, longitude` in **Start** and **Destination**, or pick points on the map.
3. Add stops, adjust the points and review the calculated route.
4. Optionally enter a **GPX name**, then press **Download GPX**.

Gestures, shortcuts and every control are explained on the [Help page](https://route-gpx.t00ls.dev/help.html).

## Good to know

- Nothing is saved automatically: use **Save route** to keep the exact geometry in this browser, and export backups, since clearing browser data can remove saved routes.
- Routing currently uses a car profile. **Prefer main roads** flags possible local sections but does not guarantee their exclusion; estimates exclude stops and real-time traffic.
- Imported GPX tracks stay intact. Editing a point recalculates only the sections next to it, and the rest of the imported track is kept exactly; **Calculate route** recalculates the whole route. Share links store points and options, not imported geometry.
- Weather risks are a review aid, not an official warning, and the exported GPX carries no forecast or timestamps.

## Privacy

- No cookies, analytics or account.
- Map, routing, search and weather providers receive the locations each request needs and your IP address.
- Weather is requested only after you choose a departure date, and only for the route.
- Exact GPS coordinates stay in memory; using your location as a route point creates a coordinate rounded to about 100 m.
- Approximate region detection by IP can be turned off in **Settings**.
- Every service URL is configurable in **Settings**. Route links that suggest other routing or search servers open with the defaults until you choose **Use link servers**.

Providers, limits, terms, weather sampling and map layers are detailed in [services and privacy](docs/SERVICES.md).

## Local development

```sh
npm ci            # install with Node.js 22.23.4+ (Node 24.15+ and 26+ also supported)
npm run dev       # serve at http://localhost:5173/
npm run build     # type-check and build the production version
npm run preview   # preview the production build
```

## Validation

```sh
npx playwright install chromium   # once, for browser tests
npm run lint                      # ESLint
npm run format:check              # Prettier
npm test                          # Vitest unit tests (public services mocked)
npm run test:browser              # Playwright browser workflows
npm run build                     # TypeScript check and production build
```

The opt-in `npm run test:integration` calls real OSRM, and `node scripts/browser-check.mjs` runs live acceptance checks against a local server (or a deployed site through `SITE_URL`), writing only to the ignored `.browser-check.local/` folder.

## Deployment

GitHub Actions runs checks on pull requests and pushes to `main`, and successful builds of the current `main` commit deploy to GitHub Pages at `https://route-gpx.t00ls.dev/`. Changes reach `main` only through pull requests that pass CI. Vite uses `/` as its base path; see the [brand and hosting notes](docs/BRAND.md) before changing the hosting path.

## Contributing

See the [contributing guide](CONTRIBUTING.md) before opening a pull request. Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md), and security vulnerabilities are reported privately as described in the [security policy](SECURITY.md).

## Credits and license

Built with [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) and [Vitest](https://vitest.dev/). IP region by [ipwho.is](https://ipwhois.io/). Additional maps by [OpenTopoMap](https://opentopomap.org/about) and [EOX](https://maps.eox.at/). Weather data by [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with passage times and risk summaries calculated here. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

The bundled Leaflet library uses the BSD 2-Clause license and [fflate](https://github.com/101arrowz/fflate) (route-link compression) uses the MIT license; their complete notices are included in [third-party notices](public/THIRD_PARTY_NOTICES.txt) and copied into the production build.

Application code is licensed under [MIT](LICENSE). Data and dependencies retain their own licenses. No affiliation with the public service operators.

[Report a bug or contact the maintainer](https://github.com/t00ls-dev/route-gpx/issues/new/choose) · [Report a security vulnerability privately](https://github.com/t00ls-dev/route-gpx/security/advisories/new) · [Report a map issue](https://www.openstreetmap.org/fixthemap)

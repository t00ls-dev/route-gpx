# <img src="public/icons/icon.svg" width="48" height="48" alt="" align="absmiddle" /> route-gpx

Plan routes and export the complete track as GPX.

A static web tool that turns addresses, coordinates and map points into a GPX 1.1 file with the complete track and named waypoints, with no account, API key or application backend.

## Features

- **Plan:** set start, destination and stops with addresses, coordinates, map clicks or your location.
- **Edit:** move and reorder points, reverse the route, add a return trip, undo changes and lock the route against accidental edits.
- **Review:** distance, estimated duration, road references and an itinerary with turn directions, in kilometers or miles (detected from the browser, changeable in Settings), estimated from your own average speed (remembered on this device), plus sunrise, sunset and sections in the dark for a departure time, an elevation profile with altitude statistics and the climbs along the route, the road surface, paved or unpaved, with its unpaved stretches, and a virtual playback that travels the route.
- **GPX, FIT and TCX:** import GPX, FIT and TCX files up to 10 MB, also as `.gz` or `.zip` (only geometry, names, course points and recorded elevation are read, locally) and export GPX 1.1 with complete track segments and named waypoints.
- **Navigate:** on a phone, follow the route on screen with your live position, the next turn and the one after it, the remaining distance and time and the arrival time, on a map that turns with your direction of travel, or with the compass when you stop; zoom, drag or turn the map to look around and Re-center to follow again; off the route, a straight-line hint points back to it.
- **Weather:** conditions and risks along the route for a departure date, including recent past dates, in Celsius or Fahrenheit.

- **Map layers:** standard, topographic and satellite maps, with optional labels, route coloring by daylight, grade or surface and route marks (direction arrows, separate out-and-back lines, weather icons on or off).
- **Save and share:** route links, named routes saved in this browser and JSON backup import/export.
- **Interface:** available in English and Portuguese.

## Quick start

1. Open [route-gpx.t00ls.dev](https://route-gpx.t00ls.dev/).
2. Enter addresses or `latitude, longitude` in **Start** and **Destination**, or pick points on the map.
3. Add stops, adjust the points and review the calculated route.
4. Optionally enter a **GPX name**, then press **Download GPX**.

Gestures, shortcuts and every control are explained on the [Help page](https://route-gpx.t00ls.dev/help.html). Recent changes are listed on [What's new](https://route-gpx.t00ls.dev/changelog.html) and in the [changelog](CHANGELOG.md).

## Good to know

- Nothing is saved automatically: use **Save route** to keep the exact geometry in this browser, and export backups, since clearing browser data can remove saved routes.
- On phones, More actions › Add to home screen shows your browser's steps to open the site from an icon; there is nothing to install. Only the map zooms on phones, so the page never zooms by accident; Help and What's new still zoom with a pinch.
- After one visit with a connection, the app opens offline in the same browser and saved routes open and download as GPX; map tiles, routing, search, weather, elevation and surface still need a connection.
- Routing currently uses a car profile. **Prefer main roads** flags possible local sections but does not guarantee their exclusion; estimates exclude stops and real-time traffic.
- Imported GPX, FIT and TCX tracks stay intact. Editing a point recalculates only the sections next to it, and the rest of the imported track is kept exactly; **Calculate route** recalculates the whole route. Share links store points and options, not imported geometry.
- Navigation follows the route on screen while the tab stays open and the screen on: browsers stop following the location with the screen off or in another tab, iOS Safari especially. Off the route, it points back to a point on the route ahead in a straight line (a hint that does not know the roads, working without a connection). It has no live traffic and does not reroute yet; it needs no connection apart from the map data. Its map is drawn by the browser from OpenFreeMap vector tiles, so street names stay upright as it turns; without WebGL only the directions show.
- Weather risks are a review aid, not an official warning, and the exported GPX carries no forecast or timestamps.

## Privacy

- No cookies, analytics or account. A service worker keeps only the app's own files for offline use; it stores no locations and never caches map tiles or other services' responses.
- Map, routing, search and weather providers receive the locations each request needs and your IP address.
- Weather is requested only for the route and its departure. Without a chosen departure, the route leaves at the next half hour automatically, so weather is requested from Open-Meteo once the route is ready and at each new half hour; uncheck Automatic departure below the Departure field to turn this off on the device. Elevation is requested only when you open Elevation or choose the Grade coloring (points along the route go to Open-Meteo), or for one map point when you choose Elevation here; GPX files that record elevation need no request.
- Opening the Itinerary of an imported track sends that track, reduced to points about every 300 m, to the configured OSRM server for map matching; a route saved before turn directions existed gets them with one routing request. Neither changes the route's geometry.
- Surface is requested only when you open Surface or choose the Surface coloring: the route geometry, in pieces of up to 190 km, goes to the configured Valhalla server for its OpenStreetMap road attributes.
- Exact GPS coordinates stay in memory. Navigation watches your location only from Start navigation until End, pauses while the page is hidden, and never stores or sends the positions. Using your location as a route point creates a coordinate rounded to about 100 m.
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

The opt-in `npm run test:integration` calls real OSRM, and `node scripts/browser-check.mjs` runs live acceptance checks against a local server (or a deployed site through `SITE_URL`), writing only to the ignored `.browser-check.local/` folder. `npm run lighthouse` audits every sitemap page on the local preview (or `SITE_URL`) with Lighthouse, the engine behind PageSpeed Insights, writing reports to the ignored `.lighthouse.local/` folder.

## Deployment

GitHub Actions runs checks on pull requests and pushes to `main`, and successful builds of the current `main` commit deploy to GitHub Pages at `https://route-gpx.t00ls.dev/`. A weekly Lighthouse workflow, also run on demand, audits the live site. Changes reach `main` only through pull requests that pass CI. Vite uses `/` as its base path; see the [brand and hosting notes](docs/BRAND.md) before changing the hosting path.

## Contributing

See the [contributing guide](CONTRIBUTING.md) before opening a pull request. Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md), and security vulnerabilities are reported privately as described in the [security policy](SECURITY.md).

## Credits and license

Built with [Leaflet](https://leafletjs.com/), [MapLibre GL JS](https://maplibre.org/) (navigation map), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) and [Vitest](https://vitest.dev/). IP region by [ipwho.is](https://ipwhois.io/). Additional maps by [OpenTopoMap](https://opentopomap.org/about) and [EOX](https://maps.eox.at/); the navigation map by [OpenFreeMap](https://openfreemap.org/), © [OpenMapTiles](https://www.openmaptiles.org/). Weather data by [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with passage times and risk summaries calculated here; elevation from the [Copernicus DEM GLO-90](https://doi.org/10.5270/ESA-c5d3d65) via Open-Meteo. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Compass headings are corrected to true north with the [World Magnetic Model](https://www.ncei.noaa.gov/products/world-magnetic-model) (NOAA NCEI and BGS, public domain).

The bundled Leaflet library uses the BSD 2-Clause license and [fflate](https://github.com/101arrowz/fflate) (route-link compression) uses the MIT license; their complete notices are included in [third-party notices](public/THIRD_PARTY_NOTICES.txt) and copied into the production build.

Application code is licensed under [MIT](LICENSE). Data and dependencies retain their own licenses. No affiliation with the public service operators.

[Report a bug or contact the maintainer](https://github.com/t00ls-dev/route-gpx/issues/new/choose) · [Report a security vulnerability privately](https://github.com/t00ls-dev/route-gpx/security/advisories/new) · [Report a map issue](https://www.openstreetmap.org/fixthemap)

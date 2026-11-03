# route-gpx

Create driving routes and download the complete road geometry as GPX.

[Open the app](https://t00ls-dev.github.io/route-gpx/) · [Português](README.pt-BR.md) · [MIT license](LICENSE)

![route-gpx with the Tijuca to Grumari driving route](docs/screenshot.png)

[Mobile view](docs/mobile.png)

A small, static application: HTML, strict TypeScript, Vite and Leaflet. No backend, API keys, account, cookies, analytics, paid APIs or remote AI. English and Brazilian Portuguese are built in; choose the language in the header. The initial language follows your browser, and shared links remember your selection.

The interface uses a high-contrast light theme, even when the system prefers dark mode. Detailed instructions and privacy information live on the separate [Help page](https://t00ls-dev.github.io/route-gpx/help.html), keeping route creation compact on mobile.

## Plan a trip

1. Enter an address or `latitude, longitude` directly in **Start** and **Destination**. Coordinates apply automatically. For an address, press **Search** or Enter and choose a result. Alternatively, click twice on the map, or choose **Try example**.
2. Select a numbered point to move it on the map, drag a marker, add stops, reorder with the arrows, remove points or reverse the itinerary. **Round trip** adds a return itinerary, routed along legal driving directions. On divided roads, review the return stops: the nearest carriageway can cause detours.
3. Review distance, estimated driving time, highway references and the road list. Add stops on the roads you want. Changes recalculate after a short delay; **Calculate route** also lets you retry.
4. Download GPX. The export is GPX 1.1, with every full-resolution geometry point inside `trk/trkseg`, named `wpt` points, trip name and creation date. Multiple geometry segments remain separate. The filename comes from the endpoints. Open it in [gpx.studio](https://gpx.studio/) or your preferred GPX app.

**Prefer main roads** is a review aid, not a strict road exclusion. OSRM does not offer a universal “only major highways” option. The app flags possible local sections of at least 500 m when no road reference is returned; classification is a heuristic and can include major avenues, unnamed roads and access roads. Street names are preserved in their original language. References come from router steps, not fabricated classifications. The Valhalla fallback requests higher highway preference. Travel times exclude stops and are not a live traffic forecast.

Use **Undo** to restore moved, removed or reordered points (up to 50 changes per tab). Ctrl+Z / ⌘Z works outside text fields. The **km / mi** selector switches distances independently of the interface language; links preserve this choice and GPX coordinates remain unchanged.

**Average speed** optionally estimates travel time from distance and a slider with values 1, 5, 10… up to 200 km/h or 130 mph. Switching units rounds to the nearest slider position. Turn it off to restore the router estimate. This planning calculation excludes stops and traffic.

### Describe your route

Open **Describe a route**:

> From Metrô Uruguai via Alto da Boa Vista via Postinho do Alto via Estrada das Furnas via Barra da Tijuca via Prainha to Grumari. Prefer main roads.

Or in Portuguese:

> De Metrô Uruguai passando por Alto da Boa Vista passando por Postinho do Alto passando por Estrada das Furnas passando por Barra da Tijuca passando por Prainha até Grumari. Prefira vias principais.

The on-device parser supports `From A via B to C`, `Start at A through B end at C`, `De A passando por B até C`, arrows, and one place per line. `and` / `e` separate stops; edit the preview when a place itself contains these words. Coordinates also work. **Review** extracts an editable list without network searches. **Create route** resolves the places sequentially. Specify a city or country in the optional search-area field to reduce ambiguity. The built-in example landmarks are resolved locally.

This is a deterministic parser, not an LLM. It does not understand arbitrary conversational instructions or solve elevation, scenic-road, safety, road-closure or “never use local roads” constraints. Place matching uses the first geocoding result; check every marker before exporting. For full control, use the point editor or **Settings → Advanced: JSON**. The JSON editor loads and applies the same validated state used by shareable links.

### Example route

The visible example follows **Metrô Uruguai → Alto da Boa Vista → Postinho do Alto → Estrada das Furnas → Barra da Tijuca → Prainha → Grumari**. Stops sit on drivable roads, including Rua da Boa Vista outside the Postinho. The route climbs Avenida Edison Passos, descends Estrada das Furnas, then follows the main avenues toward Grumari. The endpoint is on Avenida Estado da Guanabara at the beach. Router data can change over time; inspect the result.

An exported sample is included at [docs/example.gpx](docs/example.gpx). The optional integration test uses this same example.

### Import and share

Import a `.gpx` up to 10 MB. Original track geometry and segments are retained exactly until you edit a point. Imported files have no router steps or reliable duration. Control points come from endpoints and waypoints, or a small sample when no waypoints exist. Editing reroutes through those controls; it is not lossless GPS map matching.

The URL hash stores points, options, language and service URLs. Copy the link to save or share an itinerary. A link restores points and recalculates against current router data; it does not embed imported geometry. GPX coordinates snap to drivable roads, while waypoints retain the requested positions. The UI warns if a requested point snaps more than 100 m.

## Run locally

Use Node.js **22.12 or newer** (Node 22 LTS recommended):

```sh
npm install && npm run dev
```

Open the printed `/route-gpx/` URL. Build and preview:

```sh
npm run build
npm run preview
```

## Checks

```sh
npm run lint
npm run format:check
npm test
npm run test:browser
npm run build
```

Vitest covers XML structure and escaping, exact GPX geometry, import, coordinate parsing, road references, local-road warnings, URL state, English/Portuguese text parsing, OSRM/Valhalla adapters, fallback behavior and request spacing. Playwright also checks manual coordinate entry, two map clicks, separate address searches, undo and distance units on desktop and mobile. These regression tests mock the public services; CI installs Chromium and runs them without sending requests to public services. For local browser tests, install Chromium with `npx playwright install chromium`.

Network integration is skipped by default:

```sh
npm run test:integration
```

That explicitly calls public OSRM once with **Metrô Uruguai → Alto da Boa Vista → Postinho do Alto → Estrada das Furnas → Barra da Tijuca → Prainha → Grumari**. It checks the main road names, a distance near **42 km**, full geometry and all seven stops snapped within 100 m. The example follows the main urban roads and beach access roads.

A browser acceptance script verifies a real OSRM route, GPX download/reimport, both UI languages, text preview, JSON access, mobile layout, help links and light-theme contrast when the system prefers dark mode:

```sh
npx playwright install chromium
node scripts/browser-check.mjs
# Test the deployed site instead:
SITE_URL=https://t00ls-dev.github.io/route-gpx/ node scripts/browser-check.mjs
```

It makes a real routing request and updates the screenshots, example GPX and browser report in `docs/`; keep this optional to avoid burdening public servers. It requires a running local dev server unless `SITE_URL` is supplied.

## Public services, fair use and privacy

- **OSRM** is the default; if it fails or returns no route, the app waits then tries **Valhalla**. Requests are serialized, start at least 1.5 seconds apart, and changes are debounced for 900 ms. Outdated queued calculations are discarded. No automatic retry loops.
- **Nominatim** searches are explicit, debounced for 500 ms and serialized with at least 1.1 seconds between starts. Identical queries are cached in memory. Where supported, Web Locks and a timestamp in localStorage coordinate browser tabs; no address or coordinate data is stored there. There is **no autocomplete**. Review the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): maximum one request per second, user-triggered search, attribution, identification by browser Referer, and moderate use. This limit applies to the total application traffic across users. A static browser app cannot enforce an aggregate limit across different devices; do not promote this public endpoint for high-volume usage. Switch to a responsibly hosted endpoint before scaling.
- **OSM tiles** load only for the visible map, using browser caching and visible attribution. No bulk, prefetch or offline download features. [Tile policy](https://operations.osmfoundation.org/policies/tiles/).
- Shared servers have no availability guarantee and may impose limits, return 429s, change data, block an origin or become unavailable. Error messages let you adjust points or switch servers. Do not repeatedly retry errors.
- Everything executes in your browser, but the selected routing, geocoding and tile services receive the location data necessary to answer requests. A shared link contains your points. Do not enter confidential addresses. No cookies or analytics are set by the application; providers have their own policies. Browser requests omit credentials where fetch is used and send a normal Referer identifying this site.

## Change or host a routing server

Open **Settings**, change the base URLs for OSRM, Valhalla or Nominatim, and press **Apply settings**. Use a base URL without `/route/v1/driving`, `/route` or `/search`; the app adds the endpoint. Settings are stored in the route link. Public HTTPS Pages requires an HTTPS server (localhost is accepted for local development); your server must allow browser cross-origin requests. OSRM must use the driving/car profile.

For your own OSRM, follow the [official OSRM quick start](https://github.com/Project-OSRM/osrm-backend#quick-start). Example with Docker and a regional Geofabrik extract (disk/RAM needs depend on region size; a small extract is easier to start with):

```sh
mkdir osrm-data
cd osrm-data
curl -LO https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/sudeste-latest.osm.pbf
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:latest \
  osrm-partition /data/sudeste-latest.osrm
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend:latest \
  osrm-customize /data/sudeste-latest.osrm
docker run --rm -p 127.0.0.1:5000:5000 -v "$PWD:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-routed --algorithm mld /data/sudeste-latest.osrm
```

For production, pin a released image, keep routing data updated, and put an HTTPS reverse proxy with appropriate CORS, limits and timeouts in front of OSRM. Enter that HTTPS origin in the app. For local development, `http://localhost:5000` works. This does not change the app's static deployment: self-hosting routing is optional and separate. To replace search at scale, host [Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/) too, or configure an endpoint that implements its `/search?format=jsonv2` contract.

## GitHub Pages

The repository uses `base: '/route-gpx/'` in Vite. GitHub Actions runs lint, formatting, unit tests and production build on pushes to `main` and all pull requests. Only successful `main` builds deploy through `actions/deploy-pages` to the `github-pages` environment. Pages uses the **GitHub Actions** source. No build secrets are needed. If you fork under a different repository name, update Vite's base and the documentation URLs.

## Credits and license

- Map and routing data: [© OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright).
- Map library: [Leaflet](https://leafletjs.com/), BSD-2-Clause.
- Routing: [OSRM](https://project-osrm.org/), BSD-2-Clause; [Valhalla](https://valhalla.github.io/valhalla/), MIT.
- Address lookup: [Nominatim](https://nominatim.org/), GPL-3.0.
- Build and tests: [Vite](https://vite.dev/), MIT; [Vitest](https://vitest.dev/), MIT.

Application code is [MIT](LICENSE). OSM data and third-party libraries retain their own licenses. No affiliation with the public service operators. [Report a bug or contact the maintainer](https://github.com/t00ls-dev/route-gpx/issues) · [Report a map issue](https://www.openstreetmap.org/fixthemap).

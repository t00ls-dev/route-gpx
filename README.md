<img src="public/icons/icon.svg" width="64" height="64" alt="route-gpx" />

# route-gpx

Plan routes and export the complete track as GPX.

[Open the website](https://route-gpx.t00ls.dev/) · [Português](README.pt-BR.md) · [Help](https://route-gpx.t00ls.dev/help.html) · [MIT license](LICENSE)

<p>
  <a href="https://github.com/t00ls-dev/route-gpx/actions/workflows/ci-pages.yml"><img src="https://github.com/t00ls-dev/route-gpx/actions/workflows/ci-pages.yml/badge.svg?branch=main" alt="CI on main" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.23.4-339933" alt="Node.js 22.23.4 or newer" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

## Features

- Full viewport map with a collapsible side panel on desktop, a bottom sheet on mobile and full screen controls. Locate yourself with permission, then optionally choose an approximate route point.
- Define start, destination and stops with addresses, coordinates or map clicks.
- Move and reorder points, reverse the route, add a return trip and undo changes.
- Review distance, estimated duration and road references; switch between kilometers and miles or set an average speed.
- Import GPX and export GPX 1.1 with complete track segments and named waypoints.
- Check weather along the route for a departure date, including recent past dates; optionally view recent rain radar.
- Share route links and explicitly save named routes in this browser, with JSON backup import/export.

A static web tool built with HTML, TypeScript, Vite and Leaflet. No account, API key or application backend is required. The interface supports English and Brazilian Portuguese through the header selector.

## Quick start

1. Enter addresses or `latitude, longitude` in **Start** and **Destination**, or click the map on desktop. On touch screens, hold a map point for about half a second and choose its role. Coordinates apply automatically. After three address characters and a short pause, suggestions appear; touch a result or use arrows and Enter. Enter without a selected suggestion searches Nominatim explicitly.
2. Add stops and adjust the points. Review the calculated route, distance and duration.
3. Optionally enter a **GPX name**, then press **Download GPX**. The name applies to both the file and track; when blank, the endpoints are used.

On small screens, map tools use a single column of icon buttons, including Undo, beside zoom. Their tooltips and accessible names identify each action. Address fields suggest places while typing, without a search button; the pin icon selects a point on the map. The Help icon explains touch gestures. Saved routes sits above Average speed, after the editing controls.

When supported by your browser, **Share GPX** opens the device share menu with the same named GPX file; cancelling is silent. **Download GPX** remains available. A desktop right-click (or Shift+F10 on the focused map) opens the point menu. Route drawing is simplified for the current zoom only; GPX, saved and imported geometry remain complete.

For step-by-step instructions, use the [Help page](https://route-gpx.t00ls.dev/help.html).

## Important behavior

- Imported GPX files can be up to 10 MB. Track points and segments remain intact until you edit a point, which recalculates the route. Share links contain control points and options, not imported geometry, and recalculate when opened.
- Routes are **never saved automatically**. Enter a name and use **Save route** to store the exact geometry in IndexedDB. Saving with the same name updates the entry. Reopening a saved route does not recalculate it. Export backups: clearing browser data can remove saved routes.
- Routing currently uses a car profile. **Prefer main roads** flags possible local sections; it does not guarantee their exclusion. Estimates exclude stops and real-time traffic. Review the result before using it.
- Language and distance units are independent. Changing units does not alter GPX coordinates. Optional average speed changes the time estimate; disabling it restores the router estimate.

Recent calculated routes are reused in page memory for up to 15 minutes (20 routes), avoiding repeated provider requests when returning to the same points and routing settings. **Calculate route** explicitly requests a fresh result. Search caches are also bounded in memory. Reloading clears these caches; no route or tile offline cache is created.

## Weather

In **Weather**, choose **Departure date and time**: weather is requested automatically after a brief pause, once the route is ready. Departure is optional and initially empty; without a date there is no weather request. Input and all displayed times use the device timezone, including daylight saving changes. Departures in the last **90 UTC calendar days** are accepted; older departures or arrivals beyond the forecast horizon are rejected. Past dates show **Past estimates**, or **Past estimates and forecast** when the journey crosses the current time. These are archived model estimates, not exact observations at the route point. Departure accompanies links and saved routes with backward compatibility; reopening requests weather again without storing the forecast. Failures offer **Try again**, without automatic retries.

The complete track, including imported GPX, determines cumulative distance. Samples are approximately every 20 km, including start, destination and waypoints. Below 20 km/h, spacing is reduced to about one hour of travel (for example, 5 km at 5 km/h). The maximum of 20 points (20 cards and 20 map markers in total) takes priority, so long routes or many waypoints can require larger gaps. More than 20 distinct waypoints requires reducing the points. The interface shows the exact speed used, in km/h or mph: **60 km/h by default**, or the value enabled in **Average speed**. It can be adjusted for slow or fast travel and is not tied to a vehicle. Stops and traffic are excluded from calculation. Speed changes recalculate locally while the fetched interval covers the window; if exceeded, use the refresh option. Slower travel automatically requests additional points when needed for the shorter spacing; faster travel reuses the existing points without another request. Track, departure or server changes update the forecast automatically. Each sample has one card combining time, distance, conditions and risks, with outline SVG icons on cards and colored, aligned versions on the map. Levels 1, 2 and 3 use yellow, orange and red plus an alert label; cards without alerts are neutral. All remain visible without inner scrolling. Selecting a weather icon opens the panel and focuses its matching forecast card, without a map popup. Selecting a card centers the map on that point; on mobile it also collapses the panel. Cards work with Enter and Space. Wind has an icon and is shown as headwind, tailwind or crosswind relative to the local track direction, with speed in the selected units. The nearest forecast hour is used: within 45° of wind coming from ahead is headwind, within 45° of behind is tailwind, otherwise crosswind; below 1 km/h is calm. The outgoing edge is used at bends and the incoming edge at the destination. This is model wind at 10 m, not apparent wind or a traffic/speed-dependent resistance calculation; local shelter and terrain can change it.

Map markers also show wind speed and an arrow pointing **toward where the wind blows**. Marker colors indicate headwind (red), tailwind (green), crosswind (amber), or calm/unavailable (gray). Relative direction is also named in the cards and accessible labels. Accessible labels classify mean wind: calm <1 km/h, light 1–<20, moderate 20–<39, strong 39–<62 and very strong ≥62. These simplified [Beaufort boundaries](https://www.canada.ca/en/environment-climate-change/services/general-marine-weather-information/understanding-forecasts/beaufort-wind-scale-table.html) are display categories, separate from the gust alert threshold of 60 km/h.

Source: [Open-Meteo](https://open-meteo.com/en/docs), configurable endpoint `https://api.open-meteo.com`, HTTPS/CORS and no key. Terms and documentation checked on 2026-11-08: the free API is **for non-commercial use only**, without an availability guarantee. Published limits: 600 calls/minute, 5,000/hour, 10,000/day and 300,000/month; keep usage below these ceilings. One request groups latitude/longitude lists, but **each location counts**; more than 10 variables or more than two weeks increases the count, including fractional calls. Eight hourly variables are used: temperature, precipitation probability and volume, weather code, wind speed/direction, gusts and visibility. See the [terms](https://open-meteo.com/en/terms), [call accounting](https://open-meteo.com/en/pricing) and [license](https://open-meteo.com/en/licence).

The future horizon is **16 UTC calendar days, including today**, with the last **90 days** available through the same endpoint using explicit hourly dates; departure, arrival and the one-hour margin must fit available hours. One request covers departure to arrival plus margin, rounding coverage to the end of the UTC day to allow local adjustments. Requests are serialized, at least six seconds between starts; a conservative in-memory budget also checks hourly, daily and monthly limits. The ten-minute memory cache holds up to 200 rounded locations and 100,000 hourly entries per page. Covered locations are reused even when their order or the route changes; only missing distinct locations are grouped in a new request. Cache hits do not extend freshness. There are no automatic retries. These per-page limits cannot control aggregate traffic across tabs, devices or the project; stop or reconfigure use before scaling.

Data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): the interface displays “Weather data by Open-Meteo”, the license link and notice that passage times and risk summaries are calculated by route-gpx. The data license allows reuse with attribution but does not remove the free API's non-commercial restriction.

Risk classification is a review aid, not an official warning, taking the worst case within ±1 hour (hourly bounds rounded outward). Thresholds: rain risk at probability ≥60% or volume ≥1 mm/h; heavy rain ≥10 mm/h; thunderstorms from codes 95/96/99; fog from codes 45/48 or visibility ≤1,000 m; gusts ≥60 km/h; cold/possible ice ≤2 °C or freezing codes; extreme heat ≥40 °C. Alerts appear by severity and missing data is flagged. Forecasts are approximate, on grids of several kilometres, can miss local showers and become less reliable further ahead. Passage times depend on traffic, speed and stops; real forecast accuracy cannot be evaluated here. GPX remains identical, without point timestamps.

## Rain radar

Enable **Rain radar** in **Map layers**. It is off by default and needs no departure date. The compact map control plays/pauses and selects the frame time. **Legend and opacity** expands the options; the route stays visible above the imagery. Disable it in the same menu. The selection, images and viewed area are excluded from links, saved routes and persistent storage.

[RainViewer](https://www.rainviewer.com/api.html) permits personal and educational use, without a key, with visible “Radar by RainViewer” attribution. The [specific documentation](https://www.rainviewer.com/api/weather-maps-api.html) and [2026 transition](https://www.rainviewer.com/api/transition-faq.html), checked on 2026-11-08, limit the API to the past two hours, ten-minute steps, native zoom 7 and 100 requests/IP/minute; no future forecast or satellite clouds are available. The general FAQ contains conflicting information; we follow the specific documentation's restrictions. The page serializes metadata, coverage and imagery with at least 800 ms spacing (up to 75 starts/minute), without automatic retries. This cannot control aggregate usage across tabs or devices sharing an IP.

Only visible tiles of the selected frame are requested; there is no frame prefetching, bulk download, service worker or offline cache. Previously viewed frames use bounded memory caching (64 images or 16 MB); metadata has a two-minute memory cache, refreshed only on activation or retry. Moving the map or hiding the tab pauses playback. Obsolete requests are cancelled. Enabling radar sends RainViewer your IP and visible map area, without sending the route or departure date.

The legend uses Universal Blue reflectivity in dBZ, not exact rainfall volume. The mask shades areas without coverage and is approximate, updated infrequently by the provider; transparency does not prove dry weather. Times indicate mosaic generation, with potentially older individual observations. Images older than 30 minutes are flagged; enlarging past native zoom adds no detail. Availability varies by region and is not guaranteed. Radar complements Open-Meteo forecasts; it does not replace their passage times or predict rain arrival.

## Services and privacy

Choosing a valid departure date automatically requests Open-Meteo weather, sending points along the route and the expected date/time range. Without a date no weather request is sent. Weather data and samples stay only in page memory: never in localStorage, sessionStorage, IndexedDB, application logs or links. Departure is the only new persisted trip information, only through existing links and explicit saving. The server URL preference contains no locations. Saved routes belong to the browser and site origin; changing domains does not migrate them automatically. Use the existing backup export/import to transfer them.

The site uses the selected tile provider, OSRM for routing, Valhalla as a fallback, Photon for suggestions and Nominatim for explicit address search. Maps, search and routing require an internet connection. These providers receive the locations needed for each request; shared links and backups also contain locations. The site sets no cookies or analytics.

The initial view uses, in order: a route in the URL, GPS already authorized in the browser, an approximate IP region, then browser language and timezone (offline), with a world view as the final fallback. **Use my location** requests your location directly; the browser asks for permission when needed, without a preliminary confirmation screen. Exact GPS coordinates stay in memory only, are never stored in links, localStorage, sessionStorage or IndexedDB, and are never sent to project servers or routing/search services. Choosing **Set as start** or **Add as stop** explicitly creates a rounded coordinate (about a 100 m grid) that follows normal route sharing, routing and saving behavior. Review it on the map. The tile provider receives requests for the visible map area, including when centered by GPS.

**Detect region by IP** is enabled by default and can be disabled in **Settings**; its service URL is configurable. [ipwho.is documentation](https://ipwhois.io/documentation) and [terms](https://ipwhois.io/terms) provide a free HTTPS, CORS-enabled endpoint without a key. Its published limit is 1,000 requests/day, shared by domain for browser CORS traffic; commercial use is allowed, with no availability guarantee. The browser sends its IP address to the selected provider, as it also does to tile servers. The app makes at most one attempt per tab session, with a 3 s timeout and no retries. Only an approximate city center is cached in memory; a session flag prevents repeated requests after reload. Failure silently uses the local language/timezone view. Preferences and panel state contain no location data.

Address suggestions use [Photon](https://github.com/komoot/photon#demo-server) at `https://photon.komoot.io` (configurable in Settings). Its policy permits reasonable project use, with no numeric quota or availability guarantee; heavy use can be blocked. HTTPS and open CORS were verified. Typed address text and a city-scale map-center bias are sent after 3 characters and a 300 ms pause, with a five-result limit, cancellation, memory cache and serialized starts at least 1 s apart. Numeric coordinate input, including incomplete coordinates, does not request suggestions. Nominatim is used only by Enter, including after a Photon failure, never automatically while typing. Requests are spaced and cached where applicable, but public services have limited capacity and no availability guarantee. Follow the [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) and [tile policy](https://operations.osmfoundation.org/policies/tiles/); configure your own services before scaling usage. Browser-side spacing cannot enforce a shared usage limit across all devices.

All external providers also receive the request IP and normal browser request metadata and may keep their own logs under their policies. GitHub Pages receives requests for the site files; URL fragments containing route state are not sent in HTTP requests. Browser HTTP caching of ordinary map tiles follows provider headers; the project adds no offline storage.

Routing sends control coordinates and routing options to `https://router.project-osrm.org`, or `https://valhalla1.openstreetmap.de` on fallback. Route data derives from OpenStreetMap (ODbL), with OpenStreetMap and routing-provider credits. The [OSRM operator policy](https://routing.openstreetmap.de/about.html) permits at most one request/second and documents server-side route logs; this page spaces routing starts by at least 1.5 seconds. A separate numeric quota for the Valhalla endpoint was not verified. Address search uses `https://nominatim.openstreetmap.org` and `https://photon.komoot.io`, both based on OSM/ODbL data; their input, limits and caching are described above. IP region uses `https://ipwho.is/`; the free-endpoint documentation permits keyless commercial use, but general terms also contain account and redistribution clauses whose applicability should be confirmed before scaling.

Change service base URLs in **Settings**. Remote services need HTTPS and must allow browser cross-origin requests. For self-hosting, consult the [OSRM documentation](https://github.com/Project-OSRM/osrm-backend#quick-start) and [Nominatim documentation](https://nominatim.org/release-docs/latest/admin/Installation/).

The compact **i** button at the bottom right opens a modal with the active layer's full map credits and license links, plus weather and radar credits. Links open in a new tab; **Close**, Escape or a tap outside the card closes it and returns focus to **i**. Changing layers closes the modal and updates its contents. On small screens, the route panel covers the control while open; close the panel to access it.

The Map layers control loads layers only when active; satellite Labels are optional and initially enabled. The selection and satellite edition are device preferences, outside route links and saved routes. The active tile provider receives your IP address and visible-area tile requests; labels send additional visible-area requests to EOX. No tile prefetching, offline storage or service worker is added. Zoom beyond native resolution enlarges existing tiles; it adds no detail.

| Layer                             | Source and terms                                                                                                                  | Native zoom |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Standard                          | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), ODbL data and attribution-required tiles                   | 19          |
| Topographic                       | [OpenTopoMap](https://opentopomap.org/about#verwendung), OSM/SRTM, CC BY-SA 3.0; embedding permitted with attribution             | 17          |
| Satellite                         | [EOxCloudless 2025](https://cloudless.eox.at/documentation/faq), Sentinel-2 mosaic, CC BY-NC-SA 4.0; non-commercial projects only | 14          |
| Satellite alternative in Settings | [EOxCloudless 2016](https://cloudless.eox.at/documentation/faq), CC BY 4.0; also permits commercial embedded use                  | 14          |
| Labels                            | [EOX::Maps bright overlay](https://maps.eox.at/), OSM data/ODbL; embedding permitted with OSM, EOX and MapServer credits          | 14          |

These services have no availability guarantee; follow fair use, retain attribution, and contact providers before scaling. EOX publishes no numeric quota and may throttle spikes. Its newer public mosaics prohibit commercial production use; choose 2016 for that use. Satellite is a regional, approximately 10 m mosaic, not street-level or live imagery. Esri World Imagery was evaluated and excluded: its [linked terms summary](https://goto.arcgis.com/termsofuse/viewsummary) requires Esri software or an ArcGIS subscription, incompatible with this account-free setup. The imagery licenses do not change the application's MIT code license; map screenshots retain the respective imagery terms and credits.

## Local development

Use **Node.js 22 LTS, version 22.23.4 or newer** (Node 24 and 26+ are also supported):

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/`. Coding agents follow the project instructions in [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md) imports them for Claude Code.

To build and preview the production version:

```sh
npm run build
npm run preview
```

## Validation

Install Chromium once for browser tests, then run the checks:

```sh
npx playwright install chromium
npm run lint
npm run format:check
npm test
npm run test:browser
npm run build
```

Vitest covers core logic and Playwright covers browser workflows. Regular tests mock public services. The optional `npm run test:integration` calls real OSRM.

Playwright can split the local suite without configuration changes:

```sh
npm run test:browser -- --shard=1/2
npm run test:browser -- --shard=2/2
```

The current CI runs the complete unit and browser suites in one check job, with one Chromium worker and a Vite development server; it does not use shards or merged reports yet. TypeScript is checked by `npm run build`. The opt-in live OSRM test is intentionally skipped in regular runs. Weather/radar tests fix the clock and mock services. Manual commands are `npm run format` (rewrites formatting), `node scripts/generate-brand.mjs` (regenerates brand assets) and `node scripts/browser-check.mjs` (live acceptance); the latter two are documented entry points, not orphan files.

The separate `node scripts/browser-check.mjs` acceptance script requires a running local server, or `SITE_URL` pointing to a deployed site. It calls real services, reads `docs/example.gpx` as an input fixture, and writes captures, downloaded GPX and the report only to the ignored `.browser-check.local/` directory. Screenshots are not versioned or included in these READMEs; use the project logo for presentation. Run live checks only when needed.

## Deployment

The site is published at `https://route-gpx.t00ls.dev/` over HTTPS; the old `https://t00ls-dev.github.io/route-gpx/` address redirects there. Saved routes are origin-specific, so routes saved on the old address are not available on the new domain.

GitHub Actions runs checks on pull requests and pushes to `main`. Successful builds of the current `main` commit deploy to GitHub Pages. Vite uses `/` as its base path for `https://route-gpx.t00ls.dev/`; if changing the hosting path, also update manifest paths, canonical and sharing URLs, sitemap and documentation. See [brand and hosting notes](docs/BRAND.md).

## Credits and license

Built with [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) and [Vitest](https://vitest.dev/). IP region by [ipwho.is](https://ipwhois.io/). Additional maps by [OpenTopoMap](https://opentopomap.org/about) and [EOX](https://maps.eox.at/). Weather data by [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with passage times and risk summaries calculated here. Radar by [RainViewer](https://www.rainviewer.com/), personal and educational use. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

The bundled Leaflet library uses the BSD 2-Clause license; its complete notice is included in [third-party notices](public/THIRD_PARTY_NOTICES.txt) and copied into the production build.

Application code is licensed under [MIT](LICENSE). Data and dependencies retain their own licenses. No affiliation with the public service operators.

[Report a bug or contact the maintainer](https://github.com/t00ls-dev/route-gpx/issues) · [Report a map issue](https://www.openstreetmap.org/fixthemap)
